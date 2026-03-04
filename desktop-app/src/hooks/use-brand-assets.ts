import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface FontInfo {
  name: string
  fontFamily: string
  fileUrl: string
}

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
  fonts: FontInfo[]
  // Art generation preferences
  titleFontFamily: string | null
  bodyFontFamily: string | null
}

export interface UpdateFontPreferences {
  titleFontFamily?: string | null
  bodyFontFamily?: string | null
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

export function useUpdateFontPreferences(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: async (data: UpdateFontPreferences) => {
      try {
        return await api.patch(`/api/projects/${projectId}/brand-assets`, data)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-assets', projectId] })
    },
  })
}
