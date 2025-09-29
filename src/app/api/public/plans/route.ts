import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const plans = await db.plan.findMany({ 
      where: { active: true }, 
      orderBy: [
        { sortOrder: 'asc' },
        { credits: 'asc' }
      ] 
    })
    return NextResponse.json({
      plans: plans.map(p => ({
        id: p.id,
        clerkId: p.clerkId,
        name: p.name,
        credits: p.credits,
        currency: p.currency || null,
        priceMonthlyCents: p.priceMonthlyCents ?? null,
        priceYearlyCents: p.priceYearlyCents ?? null,
        description: p.description ?? null,
        features: p.features ?? null,
        badge: p.badge ?? null,
        highlight: p.highlight ?? null,
        ctaType: p.ctaType ?? null,
        ctaLabel: p.ctaLabel ?? null,
        ctaUrl: p.ctaUrl ?? null,
        billingSource: p.billingSource ?? null,
      }))
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
