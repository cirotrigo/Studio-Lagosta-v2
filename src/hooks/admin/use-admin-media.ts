import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// =============================================================================
// TYPES
// =============================================================================

export type CMSMedia = {
  id: string
  name: string
  filename: string
  url: string
  thumbnailUrl: string | null
  mimeType: string
  size: number
  width: number | null
  height: number | null
  alt: string | null
  caption: string | null
  folder: string | null
  uploadedBy: string
  createdAt: string
  updatedAt: string
}

export type UpdateMediaInput = {
  name?: string
  alt?: string
  caption?: string
  folder?: string
}

export type UploadMediaInput = {
  file: File
  folder?: string
  alt?: string
  caption?: string
}

// =============================================================================
// MEDIA HOOKS
// =============================================================================

/**
 * Get all media files
 */
export function useAdminMedia(folder?: string) {
  return useQuery<{ media: CMSMedia[] }>({
    queryKey: ['admin', 'cms', 'media', folder],
    queryFn: () => {
      const params = folder ? `?folder=${encodeURIComponent(folder)}` : ''
      return api.get(`/api/cms/media${params}`)
    },
    staleTime: 30_000,
  })
}

/**
 * Get a single media file
 */
export function useAdminMediaFile(id: string) {
  return useQuery<{ media: CMSMedia }>({
    queryKey: ['admin', 'cms', 'media', 'file', id],
    queryFn: () => api.get(`/api/cms/media/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/**
 * Upload media file
 */
export function useUploadMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UploadMediaInput) => {
      const formData = new FormData()
      formData.append('file', data.file)
      if (data.folder) formData.append('folder', data.folder)
      if (data.alt) formData.append('alt', data.alt)
      if (data.caption) formData.append('caption', data.caption)

      const response = await fetch('/api/cms/media/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'media'] })
    },
  })
}

/**
 * Update media metadata
 */
export function useUpdateMedia(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateMediaInput) =>
      api.patch<{ media: CMSMedia }>(`/api/cms/media/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'media'] })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'media', 'file', id],
      })
    },
  })
}

/**
 * Delete media file
 */
export function useDeleteMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cms/media/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'media'] })
    },
  })
}

/**
 * Bulk delete media files
 */
export function useBulkDeleteMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post('/api/cms/media/bulk-delete', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'media'] })
    },
  })
}

/**
 * Search media files
 */
export function useSearchMedia(query: string) {
  return useQuery<{ media: CMSMedia[] }>({
    queryKey: ['admin', 'cms', 'media', 'search', query],
    queryFn: () => api.get(`/api/cms/media/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: 30_000,
  })
}

/**
 * Get media by type (images, videos, documents, etc.)
 */
export function useMediaByType(type: string) {
  return useQuery<{ media: CMSMedia[] }>({
    queryKey: ['admin', 'cms', 'media', 'type', type],
    queryFn: () => api.get(`/api/cms/media?type=${encodeURIComponent(type)}`),
    enabled: !!type,
    staleTime: 30_000,
  })
}
