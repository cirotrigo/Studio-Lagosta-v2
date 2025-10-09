import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface SiteSettings {
  id: string
  siteName: string
  shortName: string
  description: string
  logoLight: string
  logoDark: string
  favicon: string
  appleIcon?: string | null
  metaTitle?: string | null
  metaDesc?: string | null
  ogImage?: string | null
  keywords: string[]
  supportEmail?: string | null
  twitter?: string | null
  facebook?: string | null
  instagram?: string | null
  linkedin?: string | null
  github?: string | null
  gtmId?: string | null
  gaId?: string | null
  facebookPixelId?: string | null
  isActive: boolean
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface UpdateSiteSettingsData {
  siteName?: string
  shortName?: string
  description?: string
  logoLight?: string
  logoDark?: string
  favicon?: string
  appleIcon?: string | null
  metaTitle?: string | null
  metaDesc?: string | null
  ogImage?: string | null
  keywords?: string[]
  supportEmail?: string | null
  twitter?: string | null
  facebook?: string | null
  instagram?: string | null
  linkedin?: string | null
  github?: string | null
  gtmId?: string | null
  gaId?: string | null
  facebookPixelId?: string | null
}

/**
 * Hook para obter configurações do site
 */
export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ['admin', 'site-settings'],
    queryFn: () => api.get('/api/admin/site-settings'),
    staleTime: 5 * 60_000, // 5 minutos
    gcTime: 10 * 60_000, // 10 minutos
  })
}

/**
 * Hook para atualizar configurações do site
 */
export function useUpdateSiteSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateSiteSettingsData) =>
      api.patch<SiteSettings>('/api/admin/site-settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'site-settings'] })
    },
  })
}

/**
 * Hook para upload de arquivos (logos, favicons, etc.)
 */
export function useUploadFile() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

      const data = await response.json()
      return data.url as string
    },
  })
}
