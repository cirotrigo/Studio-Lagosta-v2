import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Types
export interface ChatMessage {
  id: string
  conversationId: string
  role: string
  content: string
  provider?: string | null
  model?: string | null
  attachments?: unknown
  createdAt: string
  metadata?: Record<string, unknown> | null
}

export interface ChatConversation {
  id: string
  userId: string
  clerkUserId: string
  organizationId?: string | null
  projectId?: number | null
  title: string
  lastMessageAt: string
  expiresAt: string
  createdAt: string
  updatedAt: string
  _count?: {
    messages: number
  }
  messages?: ChatMessage[]
}

export interface ConversationsResponse {
  conversations: ChatConversation[]
}

// Query Keys
const conversationKeys = {
  all: ['conversations'] as const,
  lists: (projectId: number) => [...conversationKeys.all, 'list', projectId] as const,
  list: (projectId: number) => [...conversationKeys.lists(projectId)] as const,
  details: (projectId: number) => [...conversationKeys.all, 'detail', projectId] as const,
  detail: (id: string, projectId: number) => [...conversationKeys.details(projectId), id] as const,
}

// Hooks

/**
 * Get all conversations for the current user (last 7 days)
 */
export function useConversations(projectId?: number) {
  const enabled = Number.isFinite(projectId)

  return useQuery<ConversationsResponse>({
    queryKey: conversationKeys.list(projectId || 0),
    queryFn: () => api.get(`/api/ai/conversations?projectId=${projectId}`),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
    enabled,
  })
}

/**
 * Get a single conversation with all messages
 */
export function useConversation(id: string | null, projectId?: number) {
  const enabled = !!id && Number.isFinite(projectId)

  return useQuery<ChatConversation>({
    queryKey: conversationKeys.detail(id || '', projectId || 0),
    queryFn: () => api.get(`/api/ai/conversations/${id}?projectId=${projectId}`),
    enabled,
    staleTime: 10_000, // 10 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Create a new conversation
 */
export function useCreateConversation(projectId?: number) {
  const queryClient = useQueryClient()
  const enabled = Number.isFinite(projectId)

  return useMutation({
    mutationFn: (data: { title?: string }) =>
      api.post<ChatConversation>('/api/ai/conversations', { ...data, projectId }),
    onSuccess: () => {
      // Invalidate conversations list to show new conversation
      if (enabled) {
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists(projectId!) })
      }
    },
    meta: { enabled },
  })
}

/**
 * Delete a conversation
 */
export function useDeleteConversation(projectId?: number) {
  const queryClient = useQueryClient()
  const enabled = Number.isFinite(projectId)

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai/conversations/${id}?projectId=${projectId}`),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      if (enabled) {
        queryClient.removeQueries({ queryKey: conversationKeys.detail(deletedId, projectId!) })
        // Invalidate list
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists(projectId!) })
      }
      // Invalidate list
    },
    meta: { enabled },
  })
}

/**
 * Update conversation (e.g., rename title)
 */
export function useUpdateConversation(projectId?: number) {
  const queryClient = useQueryClient()
  const enabled = Number.isFinite(projectId)

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<ChatConversation>(`/api/ai/conversations/${id}?projectId=${projectId}`, { title }),
    onSuccess: (data) => {
      // Update cached conversation
      if (enabled) {
        queryClient.setQueryData(conversationKeys.detail(data.id, projectId!), data)
        // Invalidate list to show updated title
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists(projectId!) })
      }
    },
    meta: { enabled },
  })
}
