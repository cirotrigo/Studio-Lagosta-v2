import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// =============================================================================
// TYPES
// =============================================================================

export type CMSMenu = {
  id: string
  name: string
  slug: string
  location: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  items?: CMSMenuItem[]
}

export type CMSMenuItem = {
  id: string
  menuId: string
  label: string
  url: string
  target: string | null
  icon: string | null
  order: number
  parentId: string | null
  isVisible: boolean
  createdAt: string
  updatedAt: string
  children?: CMSMenuItem[]
}

export type CreateMenuInput = {
  name: string
  slug: string
  location: string
  isActive?: boolean
}

export type UpdateMenuInput = {
  name?: string
  slug?: string
  location?: string
  isActive?: boolean
}

export type CreateMenuItemInput = {
  menuId: string
  label: string
  url: string
  target?: string
  icon?: string
  order?: number
  parentId?: string
  isVisible?: boolean
}

export type UpdateMenuItemInput = {
  label?: string
  url?: string
  target?: string
  icon?: string
  order?: number
  parentId?: string
  isVisible?: boolean
}

// =============================================================================
// MENU HOOKS
// =============================================================================

/**
 * Get all menus
 */
export function useAdminMenus() {
  return useQuery<{ menus: CMSMenu[] }>({
    queryKey: ['admin', 'cms', 'menus'],
    queryFn: () => api.get('/api/cms/menus'),
    staleTime: 30_000,
  })
}

/**
 * Get a single menu by ID
 */
export function useAdminMenu(id: string) {
  return useQuery<{ menu: CMSMenu }>({
    queryKey: ['admin', 'cms', 'menus', id],
    queryFn: () => api.get(`/api/cms/menus/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/**
 * Create a new menu
 */
export function useCreateMenu() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateMenuInput) =>
      api.post<{ menu: CMSMenu }>('/api/cms/menus', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'menus'] })
    },
  })
}

/**
 * Update a menu
 */
export function useUpdateMenu(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateMenuInput) =>
      api.patch<{ menu: CMSMenu }>(`/api/cms/menus/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'menus'] })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menus', id],
      })
    },
  })
}

/**
 * Delete a menu
 */
export function useDeleteMenu() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cms/menus/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cms', 'menus'] })
    },
  })
}

// =============================================================================
// MENU ITEM HOOKS
// =============================================================================

/**
 * Get all items for a menu
 */
export function useAdminMenuItems(menuId: string) {
  return useQuery<{ items: CMSMenuItem[] }>({
    queryKey: ['admin', 'cms', 'menu-items', menuId],
    queryFn: () => api.get(`/api/cms/menus/${menuId}/items`),
    enabled: !!menuId,
    staleTime: 30_000,
  })
}

/**
 * Create a menu item
 */
export function useCreateMenuItem(menuId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateMenuItemInput) =>
      api.post<{ item: CMSMenuItem }>('/api/cms/menu-items', data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menu-items', menuId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menus', menuId],
      })
    },
  })
}

/**
 * Update a menu item
 */
export function useUpdateMenuItem(menuId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMenuItemInput }) =>
      api.patch<{ item: CMSMenuItem }>(`/api/cms/menu-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menu-items', menuId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menus', menuId],
      })
    },
  })
}

/**
 * Delete a menu item
 */
export function useDeleteMenuItem(menuId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cms/menu-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menu-items', menuId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menus', menuId],
      })
    },
  })
}

/**
 * Reorder menu items
 */
export function useReorderMenuItems(menuId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: Array<{ id: string; order: number; parentId?: string | null }>) =>
      api.patch('/api/cms/menu-items/reorder', { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menu-items', menuId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'cms', 'menus', menuId],
      })
    },
  })
}
