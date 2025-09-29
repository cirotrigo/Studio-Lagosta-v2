import { db } from '@/lib/db'
import { FEATURE_CREDIT_COSTS, FeatureKey } from '@/lib/credits/feature-config'

export type AdminSettingsPayload = {
  featureCosts?: Partial<Record<FeatureKey, number>>
}

export async function getRawAdminSettings() {
  try {
    const row = await db.adminSettings.findUnique({ where: { id: 'singleton' } })
    return row || null
  } catch (e) {
    console.error('getRawAdminSettings error', e)
    return null
  }
}

export async function getEffectiveFeatureCosts(): Promise<Record<FeatureKey, number>> {
  const row = await getRawAdminSettings()
  const overrides = (row?.featureCosts || {}) as Partial<Record<FeatureKey, number>>
  const merged: Record<FeatureKey, number> = { ...FEATURE_CREDIT_COSTS }
  for (const key of Object.keys(FEATURE_CREDIT_COSTS) as FeatureKey[]) {
    const v = overrides[key]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) merged[key] = Math.floor(v)
  }
  return merged
}

export async function getFeatureCost(feature: FeatureKey): Promise<number> {
  const costs = await getEffectiveFeatureCosts()
  return costs[feature]
}

export async function getEffectivePlanCredits(): Promise<Record<string, number>> {
  const plans = await db.plan.findMany({ where: { active: true } })
  const out: Record<string, number> = {}
  for (const p of plans) out[p.clerkId] = Math.max(0, Math.floor(p.credits))
  return out
}

export async function getPlanCredits(planId: string): Promise<number> {
  const plan = await db.plan.findUnique({ where: { clerkId: planId } })
  return plan ? Math.max(0, Math.floor(plan.credits)) : 0
}

export type PlanOption = { id: string; label: string }

export async function getPlanOptions(): Promise<PlanOption[]> {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } })
  return plans.map(p => ({ id: p.clerkId, label: `${p.name || p.clerkId} — ${p.clerkId}` }))
}

export async function getBasePlanCredits(): Promise<Record<string, number>> {
  const plans = await db.plan.findMany({ where: { active: true } })
  const base: Record<string, number> = {}
  for (const p of plans) base[p.clerkId] = Math.max(0, Math.floor(p.credits))
  return base
}

export async function upsertAdminSettings(updates: AdminSettingsPayload) {
  // Clean values
  const clean: AdminSettingsPayload = {}
  if (updates.featureCosts) {
    clean.featureCosts = {}
    for (const [k, v] of Object.entries(updates.featureCosts)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        clean.featureCosts[k] = Math.floor(v)
      }
    }
  }
  // All plan data managed via Plan model; no legacy plan fields here

  const row = await db.adminSettings.upsert({
    where: { id: 'singleton' },
    update: { ...clean },
    create: { id: 'singleton', ...clean },
  })
  return row
}
