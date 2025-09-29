import type { BillingPlan, PlanFeatureForm } from './types';
import type { ClerkPlan } from '@/hooks/use-admin-plans';

export const mapFeaturesFromApi = (
  features: Array<{ name?: string | null; description?: string | null; included?: boolean | null }> | null | undefined
): PlanFeatureForm[] => {
  if (!Array.isArray(features)) {
    return []
  }
  return features
    .map((feature) => {
      const name = feature?.name?.trim() ?? ''
      if (!name) return null
      return {
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
        name,
        description: feature?.description?.toString() ?? '',
        included: feature?.included ?? true,
      }
    })
    .filter(Boolean) as PlanFeatureForm[]
}

export const serializePlanForPersistence = (plan: BillingPlan) => ({
  name: plan.name.trim(),
  credits: plan.credits,
  active: plan.active ?? true,
  sortOrder: plan.sortOrder ?? 0,
  clerkName: plan.clerkName ?? null,
  currency: plan.currency?.trim().toLowerCase() || null,
  priceMonthlyCents: plan.priceMonthlyCents ?? null,
  priceYearlyCents: plan.priceYearlyCents ?? null,
  description: plan.description?.trim() ? plan.description.trim() : null,
  features: plan.features && plan.features.length > 0
    ? plan.features
        .filter((feature) => feature.name.trim())
        .map((feature) => ({
          name: feature.name.trim(),
          description: feature.description.trim() ? feature.description.trim() : null,
          included: feature.included,
        }))
    : null,
  badge: plan.badge?.trim() ? plan.badge.trim() : null,
  highlight: Boolean(plan.highlight),
  ctaType: (plan.billingSource ?? 'clerk') === 'manual' ? 'contact' : (plan.ctaType ?? 'checkout'),
  ctaLabel: plan.ctaLabel?.trim() ? plan.ctaLabel.trim() : null,
  ctaUrl: plan.ctaUrl?.trim() ? plan.ctaUrl.trim() : null,
  billingSource: plan.billingSource ?? 'clerk',
})

export const findPlanKeyByClerkId = (plans: Record<string, BillingPlan>, clerkId: string) => {
  return Object.keys(plans).find((key) => plans[key]?.clerkId === clerkId)
}

export const findPlanKeyByName = (plans: Record<string, BillingPlan>, name: string | null | undefined) => {
  if (!name) return undefined
  const target = name.toLowerCase()
  return Object.keys(plans).find((key) => plans[key]?.name.toLowerCase() === target)
}

export const toAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

export const resolveMonthlyAmount = (plan?: ClerkPlan | null) => {
  if (!plan) return null
  const derivedFromYear = plan.prices.year?.amount != null ? plan.prices.year.amount / 12 : null
  const candidates: Array<number | null> = [
    plan.prices.month?.amount ?? null,
    plan.prices.annualMonthly?.amount ?? null,
    derivedFromYear,
  ]
  for (const candidate of candidates) {
    const amount = toAmount(candidate)
    if (amount != null) return amount
  }
  return null
}

export const resolveYearlyAmount = (plan?: ClerkPlan | null) => {
  if (!plan) return null
  const derivedFromMonth = plan.prices.month?.amount != null ? plan.prices.month.amount * 12 : null
  const derivedFromAnnualMonthly = plan.prices.annualMonthly?.amount != null ? plan.prices.annualMonthly.amount * 12 : null
  const candidates: Array<number | null> = [
    plan.prices.year?.amount ?? null,
    derivedFromMonth,
    derivedFromAnnualMonthly,
  ]
  for (const candidate of candidates) {
    const amount = toAmount(candidate)
    if (amount != null) return amount
  }
  return null
}

export const resolveCurrency = (plan?: ClerkPlan | null) => {
  if (!plan) return null
  const value = plan.currency
    ?? plan.prices.month?.currency
    ?? plan.prices.annualMonthly?.currency
    ?? plan.prices.year?.currency
    ?? null
  return value ? value.toLowerCase() : null
}

export const createNewCustomPlan = (): BillingPlan => ({
  planId: undefined,
  clerkId: null,
  billingSource: 'manual',
  name: '',
  credits: 0,
  active: true,
  sortOrder: 0,
  clerkName: null,
  currency: 'usd',
  priceMonthlyCents: null,
  priceYearlyCents: null,
  description: '',
  features: [],
  badge: null,
  highlight: false,
  ctaType: 'contact',
  ctaLabel: 'Fale com a equipe',
  ctaUrl: '',
  isNew: true,
})
