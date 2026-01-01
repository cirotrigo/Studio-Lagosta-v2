import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface StoryAnalytics {
  id: string
  caption: string | null
  sentAt: string
  analytics: {
    impressions: number | null
    reach: number | null
    replies: number | null
    engagement: number | null
    engagementRate: number
  }
  fetchedAt: string | null
  url: string | null
}

interface StoriesReportResponse {
  success: boolean
  project: {
    id: number
    name: string
  }
  period: {
    days: number
    startDate: string
    endDate: string
  }
  summary: {
    totalStories: number
    totalImpressions: number
    totalReach: number
    totalReplies: number
    totalEngagement: number
    averages: {
      impressions: number
      reach: number
      replies: number
      engagementRate: number
    }
    bestStory: {
      id: string
      caption: string | null
      impressions: number | null
      reach: number | null
      replies: number | null
      sentAt: string
    } | null
  }
  stories: StoryAnalytics[]
}

interface UseStoriesAnalyticsParams {
  days?: number
}

export function useStoriesAnalytics(
  projectId: number,
  params?: UseStoriesAnalyticsParams
) {
  return useQuery<StoriesReportResponse>({
    queryKey: ['stories-analytics', projectId, params],
    queryFn: async () => {
      const queryParams = new URLSearchParams()
      if (params?.days) {
        queryParams.set('days', params.days.toString())
      }

      const url = `/api/projects/${projectId}/stories-report${
        queryParams.toString() ? `?${queryParams}` : ''
      }`

      return api.get<StoriesReportResponse>(url)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
