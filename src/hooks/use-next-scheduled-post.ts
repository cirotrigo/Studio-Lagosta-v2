import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface NextScheduledPostResponse {
  nextDate: string | null
  postId?: number
}

export function useNextScheduledPost(projectId: number | null) {
  return useQuery<NextScheduledPostResponse>({
    queryKey: ['next-scheduled-post', projectId],
    queryFn: async () => {
      if (!projectId) {
        return { nextDate: null }
      }
      return api.get(`/api/projects/${projectId}/posts/next-scheduled`)
    },
    enabled: !!projectId,
    staleTime: 60_000, // 1 minute
  })
}
