import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// =============================================================================
// TYPES
// =============================================================================

export type CMSComponent = {
  id: string
  name: string
  slug: string
  description: string | null
  type: string
  content: Record<string, unknown>
  thumbnail: string | null
  isGlobal: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type CreateComponentInput = {
  name: string
  slug: string
  description?: string
  type: string
  content: Record<string, unknown>
  thumbnail?: string
  isGlobal?: boolean
}

export type UpdateComponentInput = {
  name?: string
  slug?: string
  description?: string
  type?: string
  content?: Record<string, unknown>
  thumbnail?: string
  isGlobal?: boolean
}

// =============================================================================
// COMPONENT HOOKS
// =============================================================================

/**
 * Get all components
 */
export function useAdminComponents(type?: string) {
  return useQuery<{ components: CMSComponent[] }>({
    queryKey: ['admin', 'cms', 'components', type],
    queryFn: () => {
      const params = type ? `?type=${encodeURIComponent(type)}` : ''
      return api.get(`/api/cms/components${params}`)
    },
    staleTime: 30_000,
  })
}

/**
 * Get a single component
 */
export function useAdminComponent(id: string) {
  return useQuery<{ component: CMSComponent }>({
    queryKey: ['admin', 'cms', 'component', id],
    queryFn: () => api.get(`/api/cms/components/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/**
 * Create a new component
 */
export function useCreateComponent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateComponentInput) =>
      api.post<{ component: CMSComponent }>('/api/cms/components', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'components'] })
    },
  })
}

/**
 * Update a component
 */
export function useUpdateComponent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateComponentInput) =>
      api.patch<{ component: CMSComponent }>(`/api/cms/components/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'components'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'component', id] })
    },
  })
}

/**
 * Delete a component
 */
export function useDeleteComponent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cms/components/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'components'] })
    },
  })
}

/**
 * Get global components
 */
export function useGlobalComponents() {
  return useQuery<{ components: CMSComponent[] }>({
    queryKey: ['admin', 'cms', 'components', 'global'],
    queryFn: async () => {
      const result = await api.get<{ components: CMSComponent[] }>('/api/cms/components')
      return {
        components: result.components.filter((c) => c.isGlobal),
      }
    },
    staleTime: 30_000,
  })
}
