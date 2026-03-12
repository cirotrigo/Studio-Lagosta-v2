import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export interface FontInfo {
  name: string
  fontFamily: string
  fileUrl?: string
}

export interface TextColorPreferences {
  titleColor: string
  subtitleColor: string
  infoColor: string
  ctaColor: string
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
  textColorPreferences: TextColorPreferences | null
  overlayStyle: 'gradient' | 'solid' | null
}

export interface UpdateArtPreferences {
  titleFontFamily?: string | null
  bodyFontFamily?: string | null
  textColorPreferences?: TextColorPreferences | null
  overlayStyle?: 'gradient' | 'solid' | null
}

export function useBrandAssets(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<BrandAssets>({
    queryKey: ['brand-assets', projectId],
    queryFn: async () => {
      try {
        const brandAssets = await api.get<BrandAssets>(`/api/projects/${projectId}/brand-assets`)

        // Fallback robusto: algumas contas carregam fontes via endpoint dedicado de assets.
        // Mesclamos as duas fontes para evitar cenário onde só Inter aparece no editor.
        let projectFonts: Array<{ name?: string; fontFamily?: string; fileUrl?: string }> = []
        try {
          const response = await api.get<Array<{ name?: string; fontFamily?: string; fileUrl?: string }>>(
            `/api/projects/${projectId}/fonts`,
          )
          projectFonts = Array.isArray(response) ? response : []
        } catch (_fontsError) {
          // Mantém fluxo principal com brand-assets mesmo se endpoint de fontes falhar.
        }

        const mergedFonts = new Map<string, FontInfo>()

        const mergeFont = (font: { name?: string; fontFamily?: string; fileUrl?: string }) => {
          const family = font.fontFamily?.trim()
          if (!family) return

          const current = mergedFonts.get(family)
          if (!current || (!current.fileUrl && font.fileUrl)) {
            mergedFonts.set(family, {
              name: font.name?.trim() || family,
              fontFamily: family,
              fileUrl: font.fileUrl,
            })
          }
        }

        for (const font of brandAssets.fonts || []) mergeFont(font)
        for (const font of projectFonts) mergeFont(font)

        return {
          ...brandAssets,
          fonts: Array.from(mergedFonts.values()),
        }
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

export function useUpdateArtPreferences(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()

  return useMutation({
    mutationFn: async (data: UpdateArtPreferences) => {
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

/** @deprecated Use useUpdateArtPreferences instead */
export const useUpdateFontPreferences = useUpdateArtPreferences
