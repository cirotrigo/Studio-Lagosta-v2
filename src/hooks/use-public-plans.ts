"use client"

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface PublicPlan {
  id: string
  clerkId?: string | null
  name: string
  credits: number
  currency?: string | null
  priceMonthlyCents?: number | null
  priceYearlyCents?: number | null
  description?: string | null
  features?: Array<{ name: string; description?: string | null; included?: boolean | null }> | null
  badge?: string | null
  highlight?: boolean | null
  ctaType?: 'checkout' | 'contact' | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  billingSource?: 'clerk' | 'manual' | null
}

export function usePublicPlans() {
  return useQuery<{ plans: PublicPlan[] }>({
    queryKey: ['public', 'plans'],
    queryFn: () => api.get('/api/public/plans'),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
