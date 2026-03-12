import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface BrandStyle {
  styleDescription: string | null
  visualElements: {
    layouts?: string[]
    typography?: string[]
    patterns?: string[]
  } | null
  referenceImageUrls: string[]
}

export interface StyleAnalysisResult {
  summary: string
  detectedElements: {
    layouts: string[]
    typography: string[]
    colorTones: string[]
    patterns: string[]
    mood: string
  }
  recommendations: string
}

export function useBrandStyle(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<BrandStyle>({
    queryKey: ['brand-style', projectId],
    queryFn: async () => {
      try {
        return await api.get<BrandStyle>(`/api/projects/${projectId}/brand-style`)
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

export function useUpdateBrandStyle(projectId: number | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<BrandStyle>) => {
      return await api.put(`/api/projects/${projectId}/brand-style`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-style', projectId] })
    },
  })
}

export function useAnalyzeStyle() {
  return useMutation({
    mutationFn: async (data: { projectId: number; imageUrls: string[] }) => {
      return await api.post<StyleAnalysisResult>('/api/tools/analyze-style', data)
    },
  })
}
