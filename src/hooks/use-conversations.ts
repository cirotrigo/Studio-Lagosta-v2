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
}

export interface ChatConversation {
  id: string
  userId: string
  clerkUserId: string
  organizationId?: string | null
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
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: () => [...conversationKeys.lists()] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
}

// Hooks

/**
 * Get all conversations for the current user (last 7 days)
 */
export function useConversations() {
  return useQuery<ConversationsResponse>({
    queryKey: conversationKeys.list(),
    queryFn: () => api.get('/api/ai/conversations'),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Get a single conversation with all messages
 */
export function useConversation(id: string | null) {
  return useQuery<ChatConversation>({
    queryKey: conversationKeys.detail(id || ''),
    queryFn: () => api.get(`/api/ai/conversations/${id}`),
    enabled: !!id,
    staleTime: 10_000, // 10 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Create a new conversation
 */
export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { title?: string; organizationId?: string }) =>
      api.post<ChatConversation>('/api/ai/conversations', data),
    onSuccess: () => {
      // Invalidate conversations list to show new conversation
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
  })
}

/**
 * Delete a conversation
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai/conversations/${id}`),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: conversationKeys.detail(deletedId) })
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
  })
}

/**
 * Update conversation (e.g., rename title)
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<ChatConversation>(`/api/ai/conversations/${id}`, { title }),
    onSuccess: (data) => {
      // Update cached conversation
      queryClient.setQueryData(conversationKeys.detail(data.id), data)
      // Invalidate list to show updated title
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
  })
}
