import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// =============================================================================
// TYPES
// =============================================================================

export type CMSPageStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type CMSSectionType =
  | 'HERO'
  | 'BENTO_GRID'
  | 'FAQ'
  | 'AI_STARTER'
  | 'PRICING'
  | 'CTA'
  | 'CUSTOM'

export type CMSPage = {
  id: string
  title: string
  slug: string
  path: string
  description: string | null
  status: CMSPageStatus
  isHome: boolean
  metaTitle: string | null
  metaDesc: string | null
  ogImage: string | null
  publishedAt: string | null
  createdBy: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  sections?: CMSSection[]
}

export type CMSSection = {
  id: string
  pageId: string
  type: CMSSectionType
  name: string
  content: Record<string, unknown>
  order: number
  isVisible: boolean
  cssClasses: string | null
  createdAt: string
  updatedAt: string
  page?: CMSPage
}

export type CreatePageInput = {
  title: string
  slug: string
  path: string
  description?: string
  status?: CMSPageStatus
  isHome?: boolean
  metaTitle?: string
  metaDesc?: string
  ogImage?: string
}

export type UpdatePageInput = {
  title?: string
  slug?: string
  path?: string
  description?: string
  status?: CMSPageStatus
  isHome?: boolean
  metaTitle?: string
  metaDesc?: string
  ogImage?: string
}

export type CreateSectionInput = {
  pageId: string
  type: CMSSectionType
  name: string
  content: Record<string, unknown>
  order?: number
  isVisible?: boolean
  cssClasses?: string
}

export type UpdateSectionInput = {
  type?: CMSSectionType
  name?: string
  content?: Record<string, unknown>
  order?: number
  isVisible?: boolean
  cssClasses?: string
}

// =============================================================================
// PAGE HOOKS
// =============================================================================

/**
 * Get all pages
 */
export function useAdminPages(status?: CMSPageStatus) {
  return useQuery<{ pages: CMSPage[] }>({
    queryKey: ['admin', 'cms', 'pages', status],
    queryFn: () => {
      const params = status ? `?status=${status}` : ''
      return api.get(`/api/cms/pages${params}`)
    },
    staleTime: 30_000, // 30 seconds
  })
}

/**
 * Get a single page by ID
 */
export function useAdminPage(id: string) {
  return useQuery<{ page: CMSPage }>({
    queryKey: ['admin', 'cms', 'pages', id],
    queryFn: () => api.get(`/api/cms/pages/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/**
 * Create a new page
 */
export function useCreatePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreatePageInput) =>
      api.post<{ page: CMSPage }>('/api/cms/pages', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] })
    },
  })
}

/**
 * Update a page
 */
export function useUpdatePage(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdatePageInput) =>
      api.patch<{ page: CMSPage }>(`/api/cms/pages/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', id],
      })
    },
  })
}

/**
 * Delete a page
 */
export function useDeletePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cms/pages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] })
    },
  })
}

/**
 * Publish/Unpublish a page
 */
export function useTogglePagePublish(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (publish: boolean) =>
      api.post<{ page: CMSPage }>(`/api/cms/pages/${id}/publish`, { publish }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', id],
      })
    },
  })
}

/**
 * Duplicate a page
 */
export function useDuplicatePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ page: CMSPage }>(`/api/cms/pages/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'pages'] })
    },
  })
}

// =============================================================================
// SECTION HOOKS
// =============================================================================

/**
 * Get all sections for a page
 */
export function useAdminSections(pageId: string) {
  return useQuery<{ sections: CMSSection[] }>({
    queryKey: ['admin', 'cms', 'sections', pageId],
    queryFn: () => api.get(`/api/cms/sections?pageId=${pageId}`),
    enabled: !!pageId,
    staleTime: 30_000,
  })
}

/**
 * Get a single section by ID
 */
export function useAdminSection(id: string) {
  return useQuery<{ section: CMSSection }>({
    queryKey: ['admin', 'cms', 'sections', 'detail', id],
    queryFn: () => api.get(`/api/cms/sections/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/**
 * Create a new section
 */
export function useCreateSection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateSectionInput) =>
      api.post<{ section: CMSSection }>('/api/cms/sections', data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', variables.pageId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', variables.pageId],
      })
    },
  })
}

/**
 * Update a section
 */
export function useUpdateSection(id: string, pageId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateSectionInput) =>
      api.patch<{ section: CMSSection }>(`/api/cms/sections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', pageId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', 'detail', id],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', pageId],
      })
    },
  })
}

/**
 * Delete a section
 */
export function useDeleteSection(pageId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cms/sections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', pageId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', pageId],
      })
    },
  })
}

/**
 * Toggle section visibility
 */
export function useToggleSectionVisibility(pageId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ section: CMSSection }>(
        `/api/cms/sections/${id}/toggle-visibility`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', pageId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', pageId],
      })
    },
  })
}

/**
 * Duplicate a section
 */
export function useDuplicateSection(pageId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ section: CMSSection }>(`/api/cms/sections/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', pageId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', pageId],
      })
    },
  })
}

/**
 * Reorder sections
 */
export function useReorderSections(pageId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sections: Array<{ id: string; order: number }>) =>
      api.patch('/api/cms/sections', { sections }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'sections', pageId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'pages', pageId],
      })
    },
  })
}
