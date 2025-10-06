import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export type EntryStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED'

export interface KnowledgeBaseEntry {
  id: string
  title: string
  content: string
  tags: string[]
  status: EntryStatus
  userId: string | null
  workspaceId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEntryInput {
  title: string
  content: string
  tags?: string[]
  status?: EntryStatus
}

export interface UpdateEntryInput {
  title?: string
  content?: string
  tags?: string[]
  status?: EntryStatus
}

export function useKnowledgeBase(status?: EntryStatus) {
  const queryParams = status ? `?status=${status}` : ''

  return useQuery<KnowledgeBaseEntry[]>({
    queryKey: ['knowledge-base', status],
    queryFn: () => api.get<KnowledgeBaseEntry[]>(`/api/knowledge-base${queryParams}`),
    staleTime: 2 * 60_000, // 2 minutes
  })
}

export function useKnowledgeBaseEntry(id: string | null) {
  return useQuery<KnowledgeBaseEntry | null>({
    queryKey: ['knowledge-base', id],
    enabled: id !== null,
    queryFn: async () => {
      if (!id) return null
      return api.get<KnowledgeBaseEntry>(`/api/knowledge-base/${id}`)
    },
  })
}

export function useCreateKnowledgeBaseEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateEntryInput) =>
      api.post<KnowledgeBaseEntry>('/api/knowledge-base', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] })
    },
  })
}

export function useUpdateKnowledgeBaseEntry(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateEntryInput) =>
      api.patch<KnowledgeBaseEntry>(`/api/knowledge-base/${id}`, data),
    onSuccess: (entry) => {
      queryClient.setQueryData(['knowledge-base', id], entry)
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] })
    },
  })
}

export function useDeleteKnowledgeBaseEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/knowledge-base/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] })
    },
  })
}
