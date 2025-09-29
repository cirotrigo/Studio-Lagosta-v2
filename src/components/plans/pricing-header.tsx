"use client"

import { cn } from '@/lib/utils'
import { BillingPeriodToggle } from './billing-period-toggle'

type BillingPeriod = 'monthly' | 'yearly'

type PricingHeaderProps = {
  title?: string
  subtitle?: string
  billingPeriod: BillingPeriod
  onBillingPeriodChange: (period: BillingPeriod) => void
  layout?: 'default' | 'compact'
  className?: string
}

export function PricingHeader({
  title,
  subtitle,
  billingPeriod,
  onBillingPeriodChange,
  layout = 'default',
  className
}: PricingHeaderProps) {
  return (
    <div className={cn(
      'flex flex-col items-center gap-4',
      layout === 'compact' ? 'mb-8 px-4 text-center' : 'mb-12',
      className
    )}>
      {title && (
        <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-center text-zinc-600 dark:text-zinc-400 max-w-2xl">
          {subtitle}
        </p>
      )}
      <BillingPeriodToggle 
        value={billingPeriod}
        onChange={onBillingPeriodChange}
      />
    </div>
  )
}
