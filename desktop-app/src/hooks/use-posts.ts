import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
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
}

export interface CreatePostData {
  postType: PostType
  caption: string
  mediaUrls: string[]
  scheduleType: ScheduleType
  scheduledDatetime?: string
}

export interface UpdatePostData {
  caption?: string
  mediaUrls?: string[]
  status?: string
  scheduledDatetime?: string
}

export function usePosts(projectId: number | undefined) {
  return useQuery<Post[]>({
    queryKey: ['posts', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const data = await api.get<Post[]>(`/api/projects/${projectId}/posts`)
      return data
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function usePost(projectId: number | undefined, postId: string | undefined) {
  return useQuery<Post>({
    queryKey: ['post', projectId, postId],
    queryFn: async () => {
      if (!projectId || !postId) throw new Error('Missing project or post ID')
      const data = await api.get<Post>(`/api/projects/${projectId}/posts/${postId}`)
      return data
    },
    enabled: !!projectId && !!postId,
  })
}

export function useCreatePost(projectId: number | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreatePostData) => {
      if (!projectId) throw new Error('No project selected')
      return api.post<Post>(`/api/projects/${projectId}/posts`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', projectId] })
    },
  })
}

export function useUpdatePost(projectId: number | undefined, postId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdatePostData) => {
      if (!projectId) throw new Error('No project selected')
      return api.put<Post>(`/api/projects/${projectId}/posts/${postId}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['post', projectId, postId] })
    },
  })
}

export function useDeletePost(projectId: number | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!projectId) throw new Error('No project selected')
      return api.delete(`/api/projects/${projectId}/posts/${postId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', projectId] })
    },
  })
}
