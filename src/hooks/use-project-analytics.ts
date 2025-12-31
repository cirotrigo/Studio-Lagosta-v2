/**
 * Project Analytics Hook
 * Custom hook for fetching aggregated analytics data for a project
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface PostAnalyticsItem {
  id: string
  postType: string
  caption: string
  sentAt: string | null
  publishedUrl: string | null
  laterPostId: string | null
  analyticsLikes: number | null
  analyticsComments: number | null
  analyticsShares: number | null
  analyticsReach: number | null
  analyticsImpressions: number | null
  analyticsEngagement: number | null
  analyticsFetchedAt: string | null
}

export interface ProjectAnalyticsSummary {
  totalPosts: number
  totalLikes: number
  totalComments: number
  totalShares: number
  totalReach: number
  totalImpressions: number
  totalEngagement: number
  avgEngagementRate: number
  postsWithAnalytics: number
}

export interface ProjectAnalyticsResponse {
  summary: ProjectAnalyticsSummary
  posts: PostAnalyticsItem[]
  topPerformers: {
    byEngagement: PostAnalyticsItem[]
    byReach: PostAnalyticsItem[]
  }
}

export interface ProjectAnalyticsParams {
  fromDate?: string // ISO date
  toDate?: string // ISO date
  limit?: number
  sortBy?: 'sentAt' | 'engagement' | 'reach'
  order?: 'asc' | 'desc'
}

/**
 * Fetch aggregated analytics for a project
 */
export function useProjectAnalytics(
  projectId: number | null,
  params?: ProjectAnalyticsParams
) {
  const queryParams = new URLSearchParams()

  if (params?.fromDate) queryParams.set('fromDate', params.fromDate)
  if (params?.toDate) queryParams.set('toDate', params.toDate)
  if (params?.limit) queryParams.set('limit', params.limit.toString())
  if (params?.sortBy) queryParams.set('sortBy', params.sortBy)
  if (params?.order) queryParams.set('order', params.order)

  const queryString = queryParams.toString()

  return useQuery<ProjectAnalyticsResponse>({
    queryKey: ['project-analytics', projectId, queryString],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required')

      const endpoint = `/api/projects/${projectId}/analytics${
        queryString ? `?${queryString}` : ''
      }`

      return api.get<ProjectAnalyticsResponse>(endpoint)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
