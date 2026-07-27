import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { FontComboElement } from '@/lib/font-combinations'

export interface FontCombination {
  id: string
  projectId: number
  name: string
  order: number
  elements: FontComboElement[]
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

const chave = (projectId: number | undefined) => ['font-combinations', projectId]

/** Combinações do projeto; o servidor semeia os modelos base no primeiro acesso */
export function useFontCombinations(projectId: number | undefined) {
  return useQuery<FontCombination[]>({
    queryKey: chave(projectId),
    queryFn: () => api.get(`/api/projects/${projectId}/font-combinations`),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

export interface SalvarCombinacaoInput {
  name: string
  elements: FontComboElement[]
}

export function useCreateFontCombination(projectId: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SalvarCombinacaoInput) =>
      api.post<FontCombination>(`/api/projects/${projectId}/font-combinations`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave(projectId) }),
  })
}

export function useUpdateFontCombination(projectId: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<SalvarCombinacaoInput> & { id: string }) =>
      api.put<FontCombination>(`/api/projects/${projectId}/font-combinations/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave(projectId) }),
  })
}

export function useDeleteFontCombination(projectId: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${projectId}/font-combinations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave(projectId) }),
  })
}
