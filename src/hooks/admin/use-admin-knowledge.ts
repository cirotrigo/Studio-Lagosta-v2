/**
 * TanStack Query hooks for admin knowledge base management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Types
export interface KnowledgeBaseEntry {
  id: string
  title: string
  content: string
  tags: string[]
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  userId: string | null
  workspaceId: string | null
  createdAt: string
  updatedAt: string
  _count?: {
    chunks: number
  }
}

export interface KnowledgeChunk {
  id: string
  entryId: string
  ordinal: number
  content: string
  tokens: number | null
  vectorId: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEntryWithChunks extends KnowledgeBaseEntry {
  chunks: KnowledgeChunk[]
}

export interface KnowledgeListResponse {
  entries: KnowledgeBaseEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CreateEntryInput {
  title: string
  content: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  workspaceId?: string
}

export interface UploadFileInput {
  title: string
  filename: string
  fileContent: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  workspaceId?: string
}

export interface UpdateEntryInput {
  title?: string
  content?: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

export interface ListEntriesParams {
  page?: number
  limit?: number
  search?: string
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  workspaceId?: string
}

/**
 * Query: List knowledge base entries
 */
export function useKnowledgeEntries(params: ListEntriesParams = {}) {
  const queryParams = new URLSearchParams()

  if (params.page) queryParams.set('page', params.page.toString())
  if (params.limit) queryParams.set('limit', params.limit.toString())
  if (params.search) queryParams.set('search', params.search)
  if (params.status) queryParams.set('status', params.status)
  if (params.workspaceId) queryParams.set('workspaceId', params.workspaceId)

  const queryString = queryParams.toString()
  const url = `/api/admin/knowledge${queryString ? `?${queryString}` : ''}`

  return useQuery<KnowledgeListResponse>({
    queryKey: ['admin', 'knowledge', params],
    queryFn: () => api.get(url),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Query: Get single entry details
 */
export function useKnowledgeEntry(entryId: string | undefined) {
  return useQuery<KnowledgeEntryWithChunks>({
    queryKey: ['admin', 'knowledge', entryId],
    queryFn: () => api.get(`/api/admin/knowledge/${entryId}`),
    enabled: !!entryId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

/**
 * Mutation: Create knowledge entry from text
 */
export function useCreateKnowledgeEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateEntryInput) =>
      api.post('/api/admin/knowledge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge'] })
    },
  })
}

/**
 * Mutation: Upload file as knowledge entry
 */
export function useUploadKnowledgeFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UploadFileInput) =>
      api.post('/api/admin/knowledge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge'] })
    },
  })
}

/**
 * Mutation: Update knowledge entry
 */
export function useUpdateKnowledgeEntry(entryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateEntryInput) =>
      api.put(`/api/admin/knowledge/${entryId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge', entryId] })
    },
  })
}

/**
 * Mutation: Delete knowledge entry
 */
export function useDeleteKnowledgeEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entryId: string) =>
      api.delete(`/api/admin/knowledge/${entryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge'] })
    },
  })
}

/**
 * Mutation: Reindex knowledge entry
 */
export function useReindexKnowledgeEntry(entryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      api.post(`/api/admin/knowledge/${entryId}/reindex`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge', entryId] })
    },
  })
}
