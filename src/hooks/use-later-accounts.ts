/**
 * Later Accounts Hook
 * Custom hook for fetching Instagram accounts connected to Later
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface LaterAccount {
  id: string
  username: string
  displayName: string
  platform: string
  isActive: boolean
  profileId: string
  followers: number | null
}

interface LaterAccountsResponse {
  accounts: LaterAccount[]
  total: number
}

/**
 * Fetch all Instagram accounts connected to Later
 */
export function useLaterAccounts() {
  return useQuery<LaterAccountsResponse>({
    queryKey: ['later-accounts'],
    queryFn: () => api.get('/api/later/accounts'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
