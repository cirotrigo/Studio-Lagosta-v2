import { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import type { PlanDisplay, PlanFeatureDisplay } from './plan-types'

export type PlanFeature = {
  name: string
  description: string
  included: boolean
}

export type PlanCta = {
  type: 'checkout' | 'contact'
  label: string
  url?: string | null
}

export type PlanTierView = {
  plan: PlanDisplay
  key: string
  description: string
  features: PlanFeature[]
  highlight: boolean
  badge?: string | null
  icon: ReactNode
  cta: PlanCta
}

type PlanMetadata = {
  description: string
  features: PlanFeature[]
  highlight?: boolean
  badge?: string
  icon: ReactNode
  cta?: Partial<PlanCta>
}

const DEFAULT_METADATA: PlanMetadata = {
  description: '',
  features: [],
  icon: <Sparkles className="h-5 w-5" />,
}

const PLAN_METADATA: Record<string, PlanMetadata> = {
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function normalizeFeatures(features: PlanFeatureDisplay[] | null | undefined, fallbackLabel: string): PlanFeature[] {
  if (!Array.isArray(features) || features.length === 0) {
    return []
  }
  return features
    .map((feature) => {
      const name = feature?.name?.trim()
      if (!name) return null
      return {
        name: name.replace('{credits}', fallbackLabel),
        description: (feature?.description ?? '').trim() || '',
        included: feature?.included ?? true,
      }
    })
    .filter(Boolean) as PlanFeature[]
}

function resolveCta(plan: PlanDisplay, metadata?: PlanMetadata): PlanCta {
  if ((plan.billingSource ?? 'clerk') === 'manual') {
    return {
      type: 'contact',
      label: plan.ctaLabel?.trim() || 'Fale com a equipe',
      url: plan.ctaUrl?.trim() || undefined,
    }
  }
  const fallbackLabel = metadata?.cta?.label ?? 'Assinar agora'
  const planType = (plan.ctaType ?? metadata?.cta?.type ?? 'checkout')
  if (planType === 'contact') {
    return {
      type: 'contact',
      label: plan.ctaLabel?.trim() || metadata?.cta?.label || 'Fale com a equipe',
      url: plan.ctaUrl?.trim() || undefined,
    }
  }
  return {
    type: 'checkout',
    label: plan.ctaLabel?.trim() || fallbackLabel,
    url: plan.ctaUrl?.trim() || undefined,
  }
}

export function buildPlanTiers(plans: PlanDisplay[]): PlanTierView[] {
  if (plans.length === 0) {
    return []
  }

  const sortedByOrder = [...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const highestCreditsKey = sortedByOrder.at(-1)?.clerkId ?? sortedByOrder.at(-1)?.id

  return plans.map((plan) => {
    const metadata = PLAN_METADATA[normalizeName(plan.name)] ?? DEFAULT_METADATA
    const creditsLabel = plan.credits.toLocaleString('pt-BR')
    const features = normalizeFeatures(plan.features ?? null, creditsLabel)
    const derivedFeatures = features.length > 0
      ? features
      : metadata.features.map((feature) => ({
        ...feature,
        name: feature.name.replace('{credits}', creditsLabel),
      }))

    const description = plan.description?.trim() || metadata.description.replace('{credits}', creditsLabel)

    const planKey = plan.clerkId ?? plan.id

    return {
      plan,
      key: planKey,
      description,
      features: derivedFeatures,
      highlight: plan.highlight === true
        ? true
        : Boolean(metadata.highlight) || planKey === highestCreditsKey,
      badge: plan.badge ?? metadata.badge ?? null,
      icon: metadata.icon,
      cta: resolveCta(plan, metadata),
    }
  })
}
