'use client'

import { Pricing } from '@/components/marketing/pricing'
import { getActivePlansSorted } from '@/lib/queries/plans'
import { use } from 'react'

type PricingContent = {
  title?: string
  subtitle?: string
  displayMode?: string
}

type CMSPricingProps = {
  content: PricingContent
}

// Normalize features helper (same as in landing page)
function normalizeFeatures(features: unknown): {
  name: string
  description: string | null
  included: boolean
}[] | null {
  if (!Array.isArray(features)) {
    return null
  }

  const normalized = features
    .map((raw: any) => {
      if (!raw) return null

      if (typeof raw === 'string') {
        const label = raw.trim()
        if (!label) return null
        return {
          name: label,
          description: null,
          included: true,
        }
      }

      const label = raw.name?.trim() ?? ''
      if (!label) return null

      return {
        name: label,
        description: raw.description?.toString().trim() || null,
        included: raw.included ?? true,
      }
    })
    .filter(Boolean) as Array<{
      name: string
      description: string | null
      included: boolean
    }>

  return normalized.length > 0 ? normalized : null
}

export function CMSPricing({ content }: CMSPricingProps) {
  const { title, subtitle } = content

  // Fetch plans from database
  const plansPromise = getActivePlansSorted()
  const plans = use(plansPromise)

  return (
    <section id="pricing" className="container mx-auto px-4 py-24">
      {(title || subtitle) && (
        <div className="mx-auto max-w-2xl text-center mb-16">
          {title && (
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-3 text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}

      <Pricing
        plans={plans.map((p) => ({
          id: p.id,
          clerkId: p.clerkId ?? null,
          name: p.name,
          credits: p.credits,
          currency: p.currency ?? null,
          priceMonthlyCents: p.priceMonthlyCents ?? null,
          priceYearlyCents: p.priceYearlyCents ?? null,
          description: p.description ?? null,
          features: normalizeFeatures(p.features),
          badge: p.badge ?? null,
          highlight: p.highlight ?? false,
          ctaType: (p.ctaType === 'checkout' || p.ctaType === 'contact') ? p.ctaType : null,
          ctaLabel: p.ctaLabel ?? null,
          ctaUrl: p.ctaUrl ?? null,
          billingSource: p.billingSource as 'clerk' | 'manual' | null,
        }))}
      />
    </section>
  )
}
