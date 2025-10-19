import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { PostType } from '../../prisma/generated/client'

interface UseAgendaPostsParams {
  projectId: number | null
  startDate: Date
  endDate: Date
  postType?: PostType | 'ALL'
}

export function useAgendaPosts({
  projectId,
  startDate,
  endDate,
  postType = 'ALL',
}: UseAgendaPostsParams) {
  return useQuery({
    queryKey: ['agenda-posts', projectId, startDate.toISOString(), endDate.toISOString(), postType],
    queryFn: async () => {
      if (!projectId) return []

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })

      if (postType !== 'ALL') {
        params.append('postType', postType)
      }

      return api.get(`/api/projects/${projectId}/posts/calendar?${params}`)
    },
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds
  })
}
