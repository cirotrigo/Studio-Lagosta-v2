import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { SiteSettings } from '@/lib/site-settings'

type SettingsResponse = {
  settings: SiteSettings | null
}

type UpdateSettingsData = Partial<Omit<SiteSettings, 'createdAt' | 'updatedAt' | 'isActive' | 'updatedBy'>> & { id?: string }

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

/**
 * Get site settings
 */
export function useSiteSettings() {
  return useQuery<SettingsResponse>({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Update site settings
 */
export function useUpdateSiteSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateSettingsData) => {
      if (data.id) {
        return api.put('/api/admin/settings', data)
      }
      return api.post('/api/admin/settings', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
    },
  })
}
