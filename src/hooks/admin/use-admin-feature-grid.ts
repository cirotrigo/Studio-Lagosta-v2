import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export type FeatureGridItem = {
  id: string
  icon: string
  iconColor?: string | null
  title: string
  description: string
  gridArea?: string | null
  order: number
  isActive: boolean
  createdBy: string
  updatedBy?: string | null
  createdAt: string
  updatedAt: string
}

export type CreateFeatureGridItemData = {
  icon: string
  iconColor?: string
  title: string
  description: string
  gridArea?: string
  order?: number
  isActive?: boolean
}

export type UpdateFeatureGridItemData = Partial<CreateFeatureGridItemData>

// Query: Listar todos os itens
export function useFeatureGridItems() {
  return useQuery<{ items: FeatureGridItem[] }>({
    queryKey: ['admin', 'feature-grid'],
    queryFn: () => api.get('/api/admin/feature-grid'),
    staleTime: 5 * 60_000, // 5 minutos
    gcTime: 10 * 60_000, // 10 minutos
  })
}

// Query: Buscar item específico
export function useFeatureGridItem(id: string) {
  return useQuery<{ item: FeatureGridItem }>({
    queryKey: ['admin', 'feature-grid', id],
    queryFn: () => api.get(`/api/admin/feature-grid/${id}`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

// Mutation: Criar item
export function useCreateFeatureGridItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateFeatureGridItemData) =>
      api.post('/api/admin/feature-grid', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-grid'] })
    },
  })
}

// Mutation: Atualizar item
export function useUpdateFeatureGridItem(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateFeatureGridItemData) =>
      api.put(`/api/admin/feature-grid/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-grid'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-grid', id] })
    },
  })
}

// Mutation: Deletar item
export function useDeleteFeatureGridItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/feature-grid/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-grid'] })
    },
  })
}

// Mutation: Reordenar itens
export function useReorderFeatureGridItems() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (items: { id: string; order: number }[]) => {
      // Atualizar ordem de cada item
      await Promise.all(
        items.map((item) =>
          api.put(`/api/admin/feature-grid/${item.id}`, { order: item.order })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-grid'] })
    },
  })
}
