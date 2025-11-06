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
    mutationFn: async ({
      postId,
      scheduledDatetime,
    }: {
      postId: string
      scheduledDatetime?: string // Optional custom datetime
    }) => {
      const post = await api.get<SocialPost>(`/api/projects/${projectId}/posts/${postId}`)

      // Use mediaUrls directly from the post (supports all post types including uploads)
      // Only use generationId if mediaUrls are not available
      const payload: any = {
        postType: post.postType,
        caption: post.caption,
        scheduleType: 'SCHEDULED' as const,
        scheduledDatetime: scheduledDatetime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Custom or tomorrow
        altText: post.altText || [],
        firstComment: post.firstComment || undefined,
        publishType: post.publishType || 'DIRECT',
      }

      // Prioritize mediaUrls (works for all post types)
      if (post.mediaUrls && post.mediaUrls.length > 0) {
        payload.mediaUrls = post.mediaUrls
        // Still link to generation if available
        if (post.generationId) {
          payload.generationIds = [post.generationId]
        }
      } else if (post.generationId) {
        // Fallback to generationId if no mediaUrls
        payload.generationIds = [post.generationId]
      } else {
        throw new Error('Post has no media URLs or generation ID to duplicate')
      }

      return api.post(`/api/projects/${projectId}/posts`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })
    },
  })

  return {
    publishNow,
    reschedulePost,
    deletePost,
    duplicatePost,
  }
}
