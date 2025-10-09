import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Prompt, CreatePromptData, UpdatePromptData, PromptFilters } from '@/types/prompt'

/**
 * Hook para buscar todos os prompts do usuário
 */
export function usePrompts(filters?: PromptFilters) {
  const queryParams = new URLSearchParams()

  if (filters?.search) {
    queryParams.append('search', filters.search)
  }

  if (filters?.category) {
    queryParams.append('category', filters.category)
  }

  const queryString = queryParams.toString()
  const url = `/api/prompts${queryString ? `?${queryString}` : ''}`

  return useQuery<Prompt[]>({
    queryKey: ['prompts', filters],
    queryFn: () => api.get(url),
    staleTime: 30_000, // 30 segundos
    gcTime: 5 * 60_000, // 5 minutos
  })
}

/**
 * Hook para buscar um prompt específico
 */
export function usePrompt(promptId: string | null) {
  return useQuery<Prompt>({
    queryKey: ['prompts', promptId],
    queryFn: () => api.get(`/api/prompts/${promptId}`),
    enabled: !!promptId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

/**
 * Hook para criar um novo prompt
 */
export function useCreatePrompt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreatePromptData) =>
      api.post('/api/prompts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
  })
}

/**
 * Hook para atualizar um prompt
 */
export function useUpdatePrompt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ promptId, data }: { promptId: string; data: UpdatePromptData }) =>
      api.patch(`/api/prompts/${promptId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      queryClient.invalidateQueries({ queryKey: ['prompts', variables.promptId] })
    },
  })
}

/**
 * Hook para deletar um prompt
 */
export function useDeletePrompt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (promptId: string) =>
      api.delete(`/api/prompts/${promptId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
  })
}
