import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import { PostType, ScheduleType } from '@/lib/constants'

export interface Post {
  id: string
  projectId: number
  postType: PostType
  caption: string
  mediaUrls: string[]
  status: string
  scheduleType: ScheduleType
  scheduledDatetime: string | null
  createdAt: string
  updatedAt: string
  // Template-based scheduling
  pageId?: string | null
  templateId?: number | null
  renderedImageUrl?: string | null
  renderStatus?: string | null
}

export interface CreatePostData {
  postType: PostType
  caption: string
  mediaUrls: string[]
  scheduleType: ScheduleType
  scheduledDatetime?: string
  // Template-based scheduling (Stories only)
  pageId?: string
  templateId?: number
  slotValues?: Record<string, unknown>
}

export interface UpdatePostData {
  caption?: string
  mediaUrls?: string[]
  status?: string
  scheduledDatetime?: string
}

// Helper to handle auth errors
function useAuthErrorHandler() {
  const { logout } = useAuthStore()
  return async (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      console.warn('[Auth] Session expired during mutation - logging out')
      await logout()
    }
  }
}

export function usePosts(projectId: number | undefined) {
  const handleAuthError = useAuthErrorHandler()
  
  return useQuery<Post[]>({
    queryKey: ['posts', projectId],
    queryFn: async () => {
      if (!projectId) return []
      try {
        const data = await api.get<Post[]>(`/api/projects/${projectId}/posts`)
        return data
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

export function usePost(projectId: number | undefined, postId: string | undefined) {
  const handleAuthError = useAuthErrorHandler()
  
  return useQuery<Post>({
    queryKey: ['post', projectId, postId],
    queryFn: async () => {
      if (!projectId || !postId) throw new Error('Missing project or post ID')
      try {
        const data = await api.get<Post>(`/api/projects/${projectId}/posts/${postId}`)
        return data
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    enabled: !!projectId && !!postId,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

export function useCreatePost(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const handleAuthError = useAuthErrorHandler()

  return useMutation({
    mutationFn: async (data: CreatePostData) => {
      if (!projectId) throw new Error('No project selected')
      try {
        return await api.post<Post>(`/api/projects/${projectId}/posts`, data)
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', projectId] })
    },
  })
}

export function useUpdatePost(projectId: number | undefined, postId: string) {
  const queryClient = useQueryClient()
  const handleAuthError = useAuthErrorHandler()

  return useMutation({
    mutationFn: async (data: UpdatePostData) => {
      if (!projectId) throw new Error('No project selected')
      try {
        return await api.put<Post>(`/api/projects/${projectId}/posts/${postId}`, data)
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['post', projectId, postId] })
    },
  })
}

export function useDeletePost(projectId: number | undefined) {
  const queryClient = useQueryClient()
  const handleAuthError = useAuthErrorHandler()

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!projectId) throw new Error('No project selected')
      try {
        return await api.delete(`/api/projects/${projectId}/posts/${postId}`)
      } catch (error) {
        await handleAuthError(error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', projectId] })
    },
  })
}
