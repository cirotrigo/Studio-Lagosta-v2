import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { db } from '@/lib/db'
import { fetchCommercePlans } from '@/lib/clerk/commerce-plans'

export const runtime = 'nodejs'

export async function POST() {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const plans = await fetchCommercePlans()
    const existingPlans = await db.plan.findMany({})
    const plansByClerkId = new Map<string, typeof existingPlans[number]>()
    const plansByName = new Map<string, typeof existingPlans[number]>()

    for (const plan of existingPlans) {
      if (plan.clerkId) {
        plansByClerkId.set(plan.clerkId, plan)
      }
      plansByName.set(plan.name.toLowerCase(), plan)
    }

    const sanitizeCurrency = (value: string | null | undefined) => value ? value.toLowerCase() : null
    const sanitizeAmount = (value: number | null | undefined) => value == null ? null : Math.max(0, Math.round(value))

    let processed = 0
    let updated = 0
    let skipped = 0
    const missingInDb = 0

    let created = 0

    for (const cp of plans) {
      processed++
      const clerkId = cp.id
      let existing = plansByClerkId.get(clerkId)
      if (!existing) {
        const nameKey = (cp.name || '').toLowerCase()
        existing = plansByName.get(nameKey)
      }
      if (!existing) {
        const monthlyAmountRaw = cp.prices.month?.amount
          ?? cp.prices.annualMonthly?.amount
          ?? (cp.prices.year?.amount != null ? Math.round(cp.prices.year.amount / 12) : null)
        const yearlyAmountRaw = cp.prices.year?.amount
          ?? (cp.prices.month?.amount != null ? cp.prices.month.amount * 12 : null)
          ?? (cp.prices.annualMonthly?.amount != null ? cp.prices.annualMonthly.amount * 12 : null)

        const currency = sanitizeCurrency(
          cp.currency
          ?? cp.prices.month?.currency
          ?? cp.prices.year?.currency
          ?? cp.prices.annualMonthly?.currency
        )

        const priceMonthlyCents = sanitizeAmount(monthlyAmountRaw)
        const priceYearlyCents = sanitizeAmount(yearlyAmountRaw)

        const createdPlan = await db.plan.create({
          data: {
            clerkId,
            name: cp.name || clerkId,
            credits: 0,
            active: true,
            clerkName: cp.name || null,
            currency,
            priceMonthlyCents,
            priceYearlyCents,
            description: null,
            features: null,
            badge: null,
            highlight: false,
            ctaType: 'checkout',
            ctaLabel: null,
            ctaUrl: null,
            billingSource: 'clerk',
          },
        })

        plansByClerkId.set(clerkId, createdPlan)
        plansByName.set(createdPlan.name.toLowerCase(), createdPlan)
        existing = createdPlan
        created++
      }

      const monthlyAmountRaw = cp.prices.month?.amount
        ?? cp.prices.annualMonthly?.amount
        ?? (cp.prices.year?.amount != null ? Math.round(cp.prices.year.amount / 12) : null)
      const yearlyAmountRaw = cp.prices.year?.amount
        ?? (cp.prices.month?.amount != null ? cp.prices.month.amount * 12 : null)
        ?? (cp.prices.annualMonthly?.amount != null ? cp.prices.annualMonthly.amount * 12 : null)

      const currency = sanitizeCurrency(
        cp.currency
        ?? cp.prices.month?.currency
        ?? cp.prices.year?.currency
        ?? cp.prices.annualMonthly?.currency
      )

      const priceMonthlyCents = sanitizeAmount(monthlyAmountRaw)
      const priceYearlyCents = sanitizeAmount(yearlyAmountRaw)
      const clerkName = cp.name ?? existing.clerkName ?? null

      const res = await db.plan.update({
        where: { id: existing.id },
        data: {
          clerkId: existing.clerkId ?? clerkId,
          clerkName,
          currency,
          priceMonthlyCents,
          priceYearlyCents,
        },
      })
      plansByClerkId.set(clerkId, res)
      plansByName.set(res.name.toLowerCase(), res)
      if (res) updated++
      else skipped++
    }

    return NextResponse.json({ processed, updated, skipped, missingInDb, created })
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'Falha ao atualizar preços' }, { status: 500 })
  }
}
