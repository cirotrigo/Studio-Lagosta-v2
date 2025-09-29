"use client"

import { ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import type { PlanTierView } from './plan-tier-config'
import { PricingHeader } from './pricing-header'
import { PricingCard } from './pricing-card'
import { type BillingPeriod } from './pricing-utils'

type PlanPricingSectionProps = {
  tiers: PlanTierView[]
  title?: string
  subtitle?: string
  className?: string
  layout?: 'default' | 'compact'
  renderAction?: (args: {
    tier: PlanTierView
    billingPeriod: BillingPeriod
    resolvedPeriod: BillingPeriod | null
    highlight: boolean
    defaultButtonClassName: string
    cta: PlanTierView['cta']
  }) => ReactNode
  showHeader?: boolean
}

export function PlanPricingSection({
  tiers,
  title = 'Preços simples e transparentes',
  subtitle = 'Comece mensalmente ou economize com a cobrança anual.',
  className,
  layout = 'default',
  renderAction,
  showHeader = true
}: PlanPricingSectionProps) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')

  if (!tiers.length) {
    return null
  }

  return (
    <section
      className={cn(
        'relative bg-background text-foreground overflow-hidden',
        layout === 'compact'
          ? 'py-6 px-0'
          : 'py-12 px-4 md:py-24 lg:py-32',
        className
      )}
    >
      <div className={cn('w-full mx-auto', layout === 'compact' ? 'max-w-full' : 'max-w-5xl')}>
        {showHeader && (
          <PricingHeader
            title={title}
            subtitle={subtitle}
            billingPeriod={billingPeriod}
            onBillingPeriodChange={setBillingPeriod}
            layout={layout}
          />
        )}

        <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', layout === 'compact' ? 'px-4' : undefined)}>
          {tiers.map((tier) => (
            <PricingCard
              key={tier.key}
              tier={tier}
              billingPeriod={billingPeriod}
              renderAction={renderAction}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
