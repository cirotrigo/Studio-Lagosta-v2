import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface UseAgendaPostsParams {
  projectId: number | null
  startDate: Date
  endDate: Date
}

export function useAgendaPosts({ projectId, startDate, endDate }: UseAgendaPostsParams) {
  return useQuery({
    queryKey: ['agenda-posts', projectId, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      if (!projectId) return []

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })

      return api.get(`/api/projects/${projectId}/posts/calendar?${params}`)
    },
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds
  })
}
