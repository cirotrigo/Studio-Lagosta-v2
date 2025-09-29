import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { FEATURE_CREDIT_COSTS, FeatureKey } from '@/lib/credits/feature-config'
import { getEffectiveFeatureCosts, getEffectivePlanCredits, upsertAdminSettings } from '@/lib/credits/settings'
import { db } from '@/lib/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const featureCosts = await getEffectiveFeatureCosts()
  const planCredits = await getEffectivePlanCredits()
  // Compose billingPlans view from Plan rows for backward compatibility with current UI
  const plans = await db.plan.findMany({ orderBy: { createdAt: 'asc' } })
  const billingPlans: Record<string, { name: string; credits: number }> = {}
  for (const p of plans) billingPlans[p.clerkId] = { name: p.name, credits: p.credits }
  return NextResponse.json({ featureCosts, planCredits, billingPlans })
}

export async function PUT(req: Request) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const incoming = body as {
      featureCosts?: Partial<Record<string, number>>
      billingPlans?: Record<string, { name: string; credits: number }>
    }

    const cleanFeatureCosts: Partial<Record<FeatureKey, number>> = {}
    if (incoming.featureCosts) {
      for (const key of Object.keys(FEATURE_CREDIT_COSTS) as FeatureKey[]) {
        const v = incoming.featureCosts[key]
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) cleanFeatureCosts[key] = Math.floor(v)
      }
    }

    // Persist featureCosts in AdminSettings
    await upsertAdminSettings({ featureCosts: cleanFeatureCosts })

    // Upsert Plans in DB
    if (incoming.billingPlans && typeof incoming.billingPlans === 'object') {
      const incomingIds = Object.keys(incoming.billingPlans)
      // Upsert by clerkId (unique)
      for (const [clerkId, cfg] of Object.entries(incoming.billingPlans)) {
        const name = (cfg?.name || '').trim()
        const credits = Math.max(0, Math.floor(Number(cfg?.credits ?? 0)))
        await db.plan.upsert({
          where: { clerkId },
          update: { name, credits, active: true },
          create: { clerkId, name, credits, active: true },
        })
      }
      // Inactivate any plan whose clerkId is not in incoming (do not delete)
      await db.plan.updateMany({ where: { clerkId: { notIn: incomingIds } }, data: { active: false } })
    }

    // Return updated snapshot
    const featureCosts = await getEffectiveFeatureCosts()
    const planCredits = await getEffectivePlanCredits()
    const plans = await db.plan.findMany({ orderBy: { createdAt: 'asc' } })
    const billingPlans: Record<string, { name: string; credits: number }> = {}
    for (const p of plans) billingPlans[p.clerkId] = { name: p.name, credits: p.credits }
    return NextResponse.json({ featureCosts, planCredits, billingPlans })
  } catch (e) {
    console.error('PUT /api/admin/settings error', e)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
