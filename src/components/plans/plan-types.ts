export type PlanFeatureDisplay = {
  name: string
  description?: string | null
  included?: boolean | null
}

export type PlanDisplay = {
  id: string
  clerkId?: string | null
  name: string
  credits: number
  sortOrder?: number
  currency?: string | null
  priceMonthlyCents?: number | null
  priceYearlyCents?: number | null
  description?: string | null
  features?: PlanFeatureDisplay[] | null
  badge?: string | null
  highlight?: boolean | null
  ctaType?: 'checkout' | 'contact' | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  billingSource?: 'clerk' | 'manual' | null
}
