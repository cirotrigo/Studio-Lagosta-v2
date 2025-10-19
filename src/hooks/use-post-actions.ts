import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { SocialPost } from '../../prisma/generated/client'

export function usePostActions(projectId: number) {
  const queryClient = useQueryClient()

  // Publish post now (reschedule to immediate)
  const publishNow = useMutation({
    mutationFn: (postId: string) =>
      api.put(`/api/projects/${projectId}/posts/${postId}`, {
        scheduleType: 'IMMEDIATE',
        scheduledDatetime: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })
    },
  })

  // Reschedule post
  const reschedulePost = useMutation({
    mutationFn: ({
      postId,
      scheduledDatetime,
    }: {
      postId: string
      scheduledDatetime: string
    }) =>
      api.put(`/api/projects/${projectId}/posts/${postId}`, {
        scheduleType: 'SCHEDULED',
        scheduledDatetime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })
    },
  })

  // Delete post
  const deletePost = useMutation({
    mutationFn: (postId: string) =>
      api.delete(`/api/projects/${projectId}/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })
    },
  })

  // Duplicate post
  const duplicatePost = useMutation({
    mutationFn: async (postId: string) => {
      const post = await api.get<SocialPost>(`/api/projects/${projectId}/posts/${postId}`)

      return api.post(`/api/projects/${projectId}/posts`, {
        postType: post.postType,
        caption: post.caption,
        generationIds: post.generationId ? [post.generationId] : [],
        scheduleType: 'SCHEDULED' as const,
        scheduledDatetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        altText: post.altText,
        firstComment: post.firstComment,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
    },
  })

  return {
    publishNow,
    reschedulePost,
    deletePost,
    duplicatePost,
  }
}
