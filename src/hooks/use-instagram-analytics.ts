import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface InstagramDashboardData {
  username: string
  currentWeek: {
    feedsPublished: number
    feedsGoal: number
    feedsCompletionRate: number
    storiesPublished: number
    storiesGoal: number
    storiesCompletionRate: number
    overallCompletionRate: number
    score: string
    daysWithoutPost: number
    alerts: Array<{
      type: string
      category: string
      message: string
      severity: string
    }>
  } | null
  dailySummaries: Array<{
    date: Date
    storiesPublished: number
    storiesGoal: number
    feedsPublished: number
    goalMet: boolean
  }>
  recentStories: Array<any>
  recentFeeds: Array<any>
}

export interface InstagramSettings {
  id: string
  projectId: number
  weeklyFeedGoal: number
  dailyStoryGoal: number
  isActive: boolean
}

export function useInstagramDashboard(projectId: number) {
  return useQuery<InstagramDashboardData>({
    queryKey: ['instagram-dashboard', projectId],
    queryFn: () => api.get(`/api/instagram/${projectId}/dashboard`),
    staleTime: 60_000, // 1 minute
    enabled: !!projectId,
  })
}

export function useInstagramSettings(projectId: number) {
  const queryClient = useQueryClient()

  const settingsQuery = useQuery<InstagramSettings>({
    queryKey: ['instagram-settings', projectId],
    queryFn: () => api.get(`/api/instagram/settings?projectId=${projectId}`),
    enabled: !!projectId,
  })

  const updateSettings = useMutation({
    mutationFn: (data: Partial<InstagramSettings>) =>
      api.put('/api/instagram/settings', { projectId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-settings', projectId] })
      queryClient.invalidateQueries({ queryKey: ['instagram-dashboard', projectId] })
    },
  })

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    updateSettings,
  }
}
