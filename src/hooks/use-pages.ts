import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface CreatePageData {
  name: string
  width: number
  height: number
  layers?: unknown[]
  background?: string
  order?: number
}

interface UpdatePageData {
  name?: string
  width?: number
  height?: number
  layers?: unknown[]
  background?: string
  order?: number
  thumbnail?: string
}

interface PageResponse {
  id: string
  name: string
  width: number
  height: number
  layers: unknown
  background: string | null
  order: number
  thumbnail: string | null
  templateId: number
  createdAt: string
  updatedAt: string
}

// Query: Buscar páginas de um template
export function usePages(templateId: number | null) {
  return useQuery<PageResponse[]>({
    queryKey: ['pages', templateId],
    queryFn: () => api.get(`/api/templates/${templateId}/pages`),
    enabled: templateId !== null,
    staleTime: 5 * 60_000, // 5 minutos (aumentado para evitar re-fetches)
    gcTime: 10 * 60_000, // 10 minutos
    refetchOnWindowFocus: false, // Não re-fetch ao focar janela
    refetchOnMount: false, // Não re-fetch ao montar se já tem cache válido
  })
}

// Query: Buscar página específica
export function usePage(templateId: number | null, pageId: string | null) {
  return useQuery<PageResponse>({
    queryKey: ['page', templateId, pageId],
    queryFn: () => api.get(`/api/templates/${templateId}/pages/${pageId}`),
    enabled: templateId !== null && pageId !== null,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

// Mutation: Criar página
export function useCreatePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: number; data: CreatePageData }) =>
      api.post(`/api/templates/${templateId}/pages`, data),
    onSuccess: (newPage, { templateId }) => {
      // Atualizar cache manualmente sem invalidar (sem re-fetch)
      queryClient.setQueryData(['pages', templateId], (oldPages: PageResponse[] | undefined) => {
        if (!oldPages) return [newPage]
        return [...oldPages, newPage]
      })
    },
  })
}

// Mutation: Atualizar página
export function useUpdatePage(options?: { skipInvalidation?: boolean }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      templateId,
      pageId,
      data,
    }: {
      templateId: number
      pageId: string
      data: UpdatePageData
    }) => api.patch(`/api/templates/${templateId}/pages/${pageId}`, data),
    onSuccess: (updatedPage, { templateId, pageId }) => {
      if (options?.skipInvalidation) {
        // Atualizar cache manualmente sem invalidar (sem re-fetch)
        queryClient.setQueryData(['page', templateId, pageId], updatedPage)

        // Atualizar a página na lista de páginas
        queryClient.setQueryData(['pages', templateId], (oldPages: PageResponse[] | undefined) => {
          if (!oldPages) return oldPages
          return oldPages.map((page) => (page.id === pageId ? updatedPage : page))
        })
      } else {
        // Invalidar normalmente (causa re-fetch)
        queryClient.invalidateQueries({ queryKey: ['page', templateId, pageId] })
        queryClient.invalidateQueries({ queryKey: ['pages', templateId] })
      }
    },
  })
}

// Mutation: Deletar página
export function useDeletePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, pageId }: { templateId: number; pageId: string }) =>
      api.delete(`/api/templates/${templateId}/pages/${pageId}`),
    // Atualização otimista - remove ANTES da API responder
    onMutate: async ({ templateId, pageId }) => {
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ['pages', templateId] })

      // Snapshot do estado anterior (para rollback se der erro)
      const previousPages = queryClient.getQueryData<PageResponse[]>(['pages', templateId])

      // Atualizar cache otimisticamente
      queryClient.setQueryData(['pages', templateId], (oldPages: PageResponse[] | undefined) => {
        if (!oldPages) return []

        // Encontrar order da página sendo deletada
        const deletedPage = oldPages.find((p) => p.id === pageId)
        const deletedOrder = deletedPage?.order ?? -1

        // Remover página e reordenar as restantes
        return oldPages
          .filter((page) => page.id !== pageId)
          .map((page) => {
            // Se a página estava depois da deletada, decrementar order
            if (page.order > deletedOrder) {
              return { ...page, order: page.order - 1 }
            }
            return page
          })
          .sort((a, b) => a.order - b.order) // Garantir ordenação
      })

      // Retornar snapshot para possível rollback
      return { previousPages }
    },
    // Se der erro, reverter para estado anterior
    onError: (_err, { templateId }, context) => {
      if (context?.previousPages) {
        queryClient.setQueryData(['pages', templateId], context.previousPages)
      }
    },
    // Após sucesso, garantir que está sincronizado
    onSettled: (_data, _error, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: ['pages', templateId] })
    },
  })
}

// Mutation: Duplicar página
export function useDuplicatePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ templateId, pageId }: { templateId: number; pageId: string }) =>
      api.post(`/api/templates/${templateId}/pages/${pageId}/duplicate`, {}),
    onSuccess: (_, { templateId }) => {
      // Invalidar queries para re-fetch com a ordem correta do banco
      // A página duplicada é sempre inserida na posição 1 (segunda página) no backend
      queryClient.invalidateQueries({ queryKey: ['pages', templateId] })
    },
  })
}

// Mutation: Reordenar páginas
export function useReorderPages() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      templateId,
      pageIds,
    }: {
      templateId: number
      pageIds: string[]
    }) => {
      // Atualizar order de cada página
      await Promise.all(
        pageIds.map((pageId, index) =>
          api.patch(`/api/templates/${templateId}/pages/${pageId}`, { order: index })
        )
      )
      return pageIds
    },
    // Atualização otimista - aplica mudança ANTES da API responder
    onMutate: async ({ templateId, pageIds }) => {
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ['pages', templateId] })

      // Snapshot do estado anterior (para rollback se der erro)
      const previousPages = queryClient.getQueryData<PageResponse[]>(['pages', templateId])

      // Atualizar cache otimisticamente
      queryClient.setQueryData(['pages', templateId], (oldPages: PageResponse[] | undefined) => {
        if (!oldPages) return []
        // Criar um mapa para busca rápida
        const pageMap = new Map(oldPages.map((p) => [p.id, p]))
        // Reordenar baseado nos IDs fornecidos e atualizar order
        return pageIds
          .map((id, index) => {
            const page = pageMap.get(id)
            if (!page) return null
            return { ...page, order: index }
          })
          .filter((p): p is PageResponse => p !== null)
      })

      // Retornar snapshot para possível rollback
      return { previousPages }
    },
    // Se der erro, reverter para estado anterior
    onError: (_err, { templateId }, context) => {
      if (context?.previousPages) {
        queryClient.setQueryData(['pages', templateId], context.previousPages)
      }
    },
    // Após sucesso, garantir que está sincronizado
    onSettled: (_data, _error, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: ['pages', templateId] })
    },
  })
}
