import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

export type DesignFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export interface Design {
  id: string
  name: string
  thumbnail: string | null
  width: number
  height: number
  format: DesignFormat
  tags: string[]
  templateId: number
  templateName: string
  updatedAt: string
}

export interface DesignsResponse {
  designs: Design[]
  total: number
  hasMore: boolean
}

export interface UseProjectDesignsOptions {
  tags?: string[]
  format?: DesignFormat
  search?: string
  limit?: number
  offset?: number
}

export function useProjectDesigns(
  projectId: number | undefined,
  options: UseProjectDesignsOptions = {}
) {
  const { logout } = useAuthStore()
  const { tags, format, search, limit = 50, offset = 0 } = options

  // Build query string
  const buildQueryString = () => {
    const params = new URLSearchParams()
    if (tags && tags.length > 0) {
      params.set('tags', tags.join(','))
    }
    if (format) {
      params.set('format', format)
    }
    if (search) {
      params.set('search', search)
    }
    if (limit) {
      params.set('limit', String(limit))
    }
    if (offset) {
      params.set('offset', String(offset))
    }
    const queryString = params.toString()
    return queryString ? `?${queryString}` : ''
  }

  return useQuery<DesignsResponse>({
    queryKey: ['project-designs', projectId, { tags, format, search, limit, offset }],
    queryFn: async () => {
      try {
        const queryString = buildQueryString()
        return await api.get<DesignsResponse>(`/api/projects/${projectId}/designs${queryString}`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds - designs change frequently
    gcTime: 5 * 60_000, // 5 minutes
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

// Helper to get aspect ratio class for thumbnails
export function getAspectRatioClass(format: DesignFormat): string {
  switch (format) {
    case 'STORY':
      return 'aspect-[9/16]'
    case 'FEED_PORTRAIT':
      return 'aspect-[4/5]'
    case 'SQUARE':
      return 'aspect-square'
    default:
      return 'aspect-[4/5]'
  }
}

// Helper to get aspect ratio number
export function getAspectRatio(format: DesignFormat): number {
  switch (format) {
    case 'STORY':
      return 9 / 16 // 0.5625
    case 'FEED_PORTRAIT':
      return 4 / 5 // 0.8
    case 'SQUARE':
      return 1
    default:
      return 4 / 5
  }
}
