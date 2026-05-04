import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface SpendingDay {
  date: string // YYYY-MM-DD em America/Sao_Paulo
  usd: number
  calls: number
}

export interface SpendingExchangeRate {
  brl: number
  fetchedAt: string
  source: 'awesomeapi' | 'cache' | 'fallback'
}

export interface SpendingResponse {
  range: { start: string; end: string }
  totals: { usd: number; calls: number; fallbackRows: number }
  byDay: SpendingDay[]
  exchangeRate: SpendingExchangeRate
}

interface UseAdminSpendingOptions {
  start: Date
  end: Date
}

export function useAdminSpending({ start, end }: UseAdminSpendingOptions) {
  return useQuery<SpendingResponse>({
    queryKey: ['admin-spending', start.toISOString(), end.toISOString()],
    queryFn: () => {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      })
      return api.get<SpendingResponse>(`/api/admin/spending?${params.toString()}`)
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })
}
