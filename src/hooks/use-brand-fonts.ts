import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface BrandAssetsResponse {
  titleFontFamily: string | null
  bodyFontFamily: string | null
  fonts: Array<{ name: string; fontFamily: string; fileUrl: string }>
}

/** Fontes da marca do projeto (título/corpo) + fontes customizadas enviadas */
export function useBrandFonts(projectId: number | string | undefined) {
  return useQuery<BrandAssetsResponse>({
    queryKey: ['brand-fonts', String(projectId)],
    queryFn: () => api.get(`/api/projects/${projectId}/brand-assets`),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

export interface UpdateBrandFontsInput {
  titleFontFamily?: string | null
  bodyFontFamily?: string | null
}

export function useUpdateBrandFonts(projectId: number | string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateBrandFontsInput) =>
      api.patch(`/api/projects/${projectId}/brand-assets`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-fonts', String(projectId)] })
    },
  })
}
