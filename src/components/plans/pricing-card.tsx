import { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PlanTierView } from './plan-tier-config'
import { PriceDisplay } from './price-display'
import { FeatureList } from './feature-list'
import { CTAButton, CTAAction } from './cta-button'
import { badgeStyles, buttonStyles, resolvePricing, type BillingPeriod } from './pricing-utils'

type PricingCardProps = {
  tier: PlanTierView
  billingPeriod: BillingPeriod
  renderAction?: (args: {
    tier: PlanTierView
    billingPeriod: BillingPeriod
    resolvedPeriod: BillingPeriod | null
    highlight: boolean
    defaultButtonClassName: string
    cta: PlanTierView['cta']
  }) => ReactNode
}

export function PricingCard({ tier, billingPeriod, renderAction }: PricingCardProps) {
  const { resolvedPeriod, hasPrice, priceLabel, billingSuffix } = resolvePricing(tier.plan, billingPeriod)
  const buttonClass = tier.highlight ? buttonStyles.highlight : buttonStyles.default
  const isFeatured = Boolean(tier.highlight)

  return (
    <div className="relative h-full rounded-3xl border-[0.75px] border-border p-2 md:rounded-3xl md:p-2">
      <div
        className={cn(
          'relative group backdrop-blur-sm h-full',
          'rounded-3xl transition-all duration-300',
          'flex flex-col',
          isFeatured
            ? 'bg-gradient-to-b from-zinc-100/90 via-white to-transparent dark:from-zinc-300/20 dark:via-zinc-900/60'
            : 'bg-white dark:bg-zinc-800/50',
          'border',
        
        )}
      >
        {(tier.badge || isFeatured) && (
          <div className="absolute -top-4 left-6">
            <Badge className={badgeStyles}>{tier.badge || 'Destaque'}</Badge>
          </div>
        )}

        <div className="p-8 flex-1">
          <div className="flex items-center justify-between mb-4">
            <div
              className={cn(
                'p-3 rounded-xl',
                isFeatured
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              )}
            >
              {tier.icon}
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {tier.plan.name}
            </h3>
          </div>

          <PriceDisplay
            priceLabel={priceLabel}
            billingSuffix={billingSuffix}
            hasPrice={hasPrice}
            description={tier.description}
          />

          <FeatureList features={tier.features} />
        </div>

        <div className="p-8 pt-0 mt-auto">
          {renderAction ? (
            renderAction({
              tier,
              billingPeriod,
              resolvedPeriod,
              highlight: Boolean(tier.highlight),
              defaultButtonClassName: buttonClass,
              cta: tier.cta
            })
          ) : (
            <CTAButton cta={tier.cta as CTAAction} className={buttonClass} isFeatured={isFeatured} />
          )}
        </div>
      </div>
    </div>
  )
}
