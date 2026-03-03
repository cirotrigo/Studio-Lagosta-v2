import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface BrandAssets {
  projectId: number
  name: string
  instagramUsername: string | null
  cuisineType: string | null
  logo: {
    url: string
    width: number | null
    height: number | null
  } | null
  colors: string[]
  fonts: string[]
}

export function useBrandAssets(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<BrandAssets>({
    queryKey: ['brand-assets', projectId],
    queryFn: async () => {
      try {
        return await api.get<BrandAssets>(`/api/projects/${projectId}/brand-assets`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}
