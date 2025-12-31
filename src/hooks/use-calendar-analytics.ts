/**
 * Hook for fetching calendar analytics
 * Fetches posts with metrics for a specific month/project
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface CalendarAnalytics {
  posts: Array<{
    id: string
    caption: string
    postType: string
    latePublishedAt: string
    latePlatformUrl: string | null
    mediaUrls: string[]
    analyticsLikes: number | null
    analyticsComments: number | null
    analyticsShares: number | null
    analyticsReach: number | null
    analyticsImpressions: number | null
    analyticsEngagement: number | null
    analyticsFetchedAt: string | null
  }>
  overview: {
    totalPosts: number
    totalLikes: number
    totalComments: number
    totalEngagement: number
    avgEngagement: number
    hasAnalytics: boolean
  }
  month: string
}

export function useCalendarAnalytics(projectId: number, month: string) {
  return useQuery<CalendarAnalytics>({
    queryKey: ['calendar-analytics', projectId, month],
    queryFn: () =>
      api.get(`/api/calendar/analytics?projectId=${projectId}&month=${month}`),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!projectId && !!month
  })
}
