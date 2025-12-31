/**
 * Post Analytics Hook
 * Custom hook for fetching analytics data for social media posts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface PostAnalytics {
  postId: string
  laterPostId: string | null
  analyticsLikes: number | null
  analyticsComments: number | null
  analyticsShares: number | null
  analyticsReach: number | null
  analyticsImpressions: number | null
  analyticsEngagement: number | null
  analyticsFetchedAt: string | null
}

/**
 * Fetch analytics for a specific post
 */
export function usePostAnalytics(postId: string | null) {
  return useQuery<PostAnalytics | null>({
    queryKey: ['post-analytics', postId],
    enabled: !!postId,
    queryFn: async () => {
      if (!postId) return null
      return api.get<PostAnalytics>(`/api/posts/${postId}/analytics`)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Force refresh analytics for a post (fetch from Later API immediately)
 */
export function useRefreshPostAnalytics(postId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post(`/api/posts/${postId}/analytics`, {}),
    onSuccess: (data) => {
      // Update cache with fresh analytics
      queryClient.setQueryData(['post-analytics', postId], data)
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['project-analytics'] })
    },
  })
}
