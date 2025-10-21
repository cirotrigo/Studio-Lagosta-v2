/**
 * TanStack Query hooks for organization knowledge base
 * Allows any organization member to contribute
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Reuse types from admin hooks
import type {
  KnowledgeBaseEntry,
  KnowledgeListResponse,
  ListEntriesParams,
} from './admin/use-admin-knowledge'

export interface CreateOrgEntryInput {
  title: string
  content: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

export interface UploadOrgFileInput {
  title: string
  filename: string
  fileContent: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

export interface UpdateOrgEntryInput {
  title?: string
  content?: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
}

/**
 * Query: List organization's knowledge base entries
 */
export function useOrgKnowledgeEntries(params: ListEntriesParams = {}) {
  const queryParams = new URLSearchParams()

  if (params.page) queryParams.set('page', params.page.toString())
  if (params.limit) queryParams.set('limit', params.limit.toString())
  if (params.search) queryParams.set('search', params.search)
  if (params.status) queryParams.set('status', params.status)

  const queryString = queryParams.toString()
  const url = `/api/knowledge${queryString ? `?${queryString}` : ''}`

  return useQuery<KnowledgeListResponse>({
    queryKey: ['org', 'knowledge', params],
    queryFn: () => api.get(url),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Mutation: Create knowledge entry for organization
 */
export function useCreateOrgKnowledgeEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateOrgEntryInput) =>
      api.post('/api/knowledge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'knowledge'] })
    },
  })
}

/**
 * Mutation: Upload file as knowledge entry for organization
 */
export function useUploadOrgKnowledgeFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UploadOrgFileInput) =>
      api.post('/api/knowledge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'knowledge'] })
    },
  })
}

/**
 * Query: Get single knowledge entry
 */
export function useOrgKnowledgeEntry(id: string) {
  return useQuery<KnowledgeBaseEntry>({
    queryKey: ['org', 'knowledge', id],
    queryFn: () => api.get(`/api/knowledge/${id}`),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

/**
 * Mutation: Update knowledge entry
 */
export function useUpdateOrgKnowledgeEntry(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateOrgEntryInput) =>
      api.put(`/api/knowledge/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'knowledge'] })
      queryClient.invalidateQueries({ queryKey: ['org', 'knowledge', id] })
    },
  })
}

/**
 * Mutation: Delete knowledge entry
 */
export function useDeleteOrgKnowledgeEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/knowledge/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'knowledge'] })
    },
  })
}
