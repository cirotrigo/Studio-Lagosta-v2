import { cn } from '@/lib/utils'

export type BillingPeriod = 'monthly' | 'yearly'

export const buttonStyles = {
  default: cn(
    'h-12 bg-white dark:bg-zinc-900',
    'hover:bg-zinc-50 dark:hover:bg-zinc-800',
    'text-zinc-900 dark:text-zinc-100',
    'border border-zinc-200 dark:border-zinc-800',
    'hover:border-zinc-300 dark:hover:border-zinc-700',
    'shadow-sm hover:shadow-md',
    'text-sm font-medium'
  ),
  highlight: cn(
    'h-12 bg-zinc-900 dark:bg-zinc-100',
    'hover:bg-zinc-800 dark:hover:bg-zinc-300',
    'text-white dark:text-zinc-900',
    'shadow-[0_1px_15px_rgba(0,0,0,0.1)]',
    'hover:shadow-[0_1px_20px_rgba(0,0,0,0.15)]',
    'font-semibold text-base'
  )
}

export const badgeStyles = cn(
  'px-4 py-1.5 text-sm font-medium',
  'bg-zinc-900 dark:bg-zinc-100',
  'text-white dark:text-zinc-900',
  'border-none shadow-lg'
)

export function formatCurrency(amountCents: number, currency?: string | null) {
  if (Number.isNaN(amountCents)) {
    return '-'
  }
  const normalizedCurrency = (currency || 'USD').toUpperCase()
  return (amountCents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: normalizedCurrency
  })
}

export function resolvePricing(
  plan: { priceMonthlyCents?: number | null; priceYearlyCents?: number | null; currency?: string | null },
  selectedPeriod: BillingPeriod
) {
  const selectedPrice = selectedPeriod === 'yearly' ? plan.priceYearlyCents : plan.priceMonthlyCents
  const hasSelectedPrice = typeof selectedPrice === 'number' && selectedPrice != null
  
  const fallbackPeriod: BillingPeriod | null = plan.priceMonthlyCents != null
    ? 'monthly'
    : plan.priceYearlyCents != null
      ? 'yearly'
      : null
  
  const resolvedPeriod = hasSelectedPrice ? selectedPeriod : fallbackPeriod
  
  const priceCents = resolvedPeriod === 'yearly'
    ? plan.priceYearlyCents
    : resolvedPeriod === 'monthly'
      ? plan.priceMonthlyCents
      : null
  
  const hasPrice = typeof priceCents === 'number' && priceCents != null
  const priceLabel = hasPrice ? formatCurrency(priceCents!, plan.currency) : 'Sob consulta'
  const billingSuffix = hasPrice ? (resolvedPeriod === 'yearly' ? 'ano' : 'mês') : null
  
  return {
    resolvedPeriod,
    priceCents,
    hasPrice,
    priceLabel,
    billingSuffix
  }
}
