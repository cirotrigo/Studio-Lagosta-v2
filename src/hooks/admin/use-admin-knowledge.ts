/**
 * TanStack Query hooks for admin knowledge base management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { KnowledgeCategory } from '@prisma/client'

// Types
export interface KnowledgeBaseEntry {
  id: string
  projectId: number
  category: KnowledgeCategory
  title: string
  content: string
  tags: string[]
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata: Record<string, unknown> | null
  createdBy: string
  updatedBy: string | null
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
  projectId: number
  category: KnowledgeCategory
  title: string
  content: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata?: Record<string, unknown>
}

export interface UploadFileInput {
  projectId: number
  category: KnowledgeCategory
  title: string
  filename: string
  fileContent: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata?: Record<string, unknown>
}

export interface UpdateEntryInput {
  title?: string
  content?: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  category?: KnowledgeCategory
  metadata?: Record<string, unknown> | null
}

export interface ListEntriesParams {
  page?: number
  limit?: number
  search?: string
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  projectId: number
  category?: KnowledgeCategory
}

/**
 * Query: List knowledge base entries
 */
export function useKnowledgeEntries(
  params: ListEntriesParams,
  options: { enabled?: boolean } = {}
) {
  const queryParams = new URLSearchParams()
  const { enabled = true } = options
  const hasProject = Number.isFinite(params.projectId)

  if (params.page) queryParams.set('page', params.page.toString())
  if (params.limit) queryParams.set('limit', params.limit.toString())
  if (params.search) queryParams.set('search', params.search)
  if (params.status) queryParams.set('status', params.status)
  if (hasProject) queryParams.set('projectId', params.projectId.toString())
  if (params.category) queryParams.set('category', params.category)

  const queryString = queryParams.toString()
  const url = `/api/admin/knowledge${queryString ? `?${queryString}` : ''}`

  return useQuery<KnowledgeListResponse>({
    queryKey: ['admin', 'knowledge', params],
    queryFn: () => api.get(url),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
    enabled: enabled && hasProject,
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
