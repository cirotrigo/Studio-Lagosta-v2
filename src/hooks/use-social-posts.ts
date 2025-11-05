import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { PostType, ScheduleType, RecurrenceFrequency, PublishType } from '../../prisma/generated/client'

interface CreatePostData {
  postType: PostType
  caption: string
  generationIds: string[]
  scheduleType: ScheduleType
  scheduledDatetime?: string
  recurringConfig?: {
    frequency: RecurrenceFrequency
    daysOfWeek?: number[]
    time: string
    endDate?: string
  }
  altText?: string[]
  firstComment?: string
  publishType?: PublishType
}

interface UpdatePostData {
  postType?: PostType
  caption?: string
  scheduleType?: ScheduleType
  scheduledDatetime?: string | null
  recurringConfig?: {
    frequency: RecurrenceFrequency
    daysOfWeek?: number[]
    time: string
    endDate?: string
  } | null
  altText?: string[]
  firstComment?: string | null
  publishType?: PublishType
}

export function useSocialPosts(projectId: number) {
  const queryClient = useQueryClient()

  // Get all posts for a project
  const postsQuery = useQuery({
    queryKey: ['social-posts', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/posts`),
    staleTime: 30_000, // 30 seconds
    // Refetch a cada 5 segundos se houver posts sendo publicados
    refetchInterval: (query) => {
      const data = query.state.data as any
      if (!data) return false

      // Verifica se há algum post com status POSTING
      const hasPostingPosts = data.some((post: any) => post.status === 'POSTING')
      return hasPostingPosts ? 5000 : false // 5 segundos
    },
  })

  // Get single post
  const usePost = (postId: string) => {
    return useQuery({
      queryKey: ['social-post', postId],
      queryFn: () => api.get(`/api/projects/${projectId}/posts/${postId}`),
      enabled: !!postId,
    })
  }

  // Create post
  const createPost = useMutation({
    mutationFn: (data: CreatePostData) =>
      api.post(`/api/projects/${projectId}/posts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      // Also invalidate agenda-posts to update calendar view
      queryClient.invalidateQueries({ queryKey: ['agenda-posts', projectId] })
    },
  })

  // Update post
  const updatePost = useMutation({
    mutationFn: ({ postId, data }: { postId: string; data: UpdatePostData }) =>
      api.put(`/api/projects/${projectId}/posts/${postId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['social-post', variables.postId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-posts', projectId] })
    },
  })

  // Delete post
  const deletePost = useMutation({
    mutationFn: (postId: string) =>
      api.delete(`/api/projects/${projectId}/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-posts', projectId] })
    },
  })

  return {
    posts: postsQuery.data,
    isLoading: postsQuery.isLoading,
    error: postsQuery.error,
    usePost,
    createPost,
    updatePost,
    deletePost,
  }
}
