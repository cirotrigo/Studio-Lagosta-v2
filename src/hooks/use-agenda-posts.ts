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
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })

      if (postType !== 'ALL') {
        params.append('postType', postType)
      }

      // Se projectId for null, busca posts de todos os projetos
      if (!projectId) {
        return api.get(`/api/posts/calendar?${params}`)
      }

      // Senão, busca posts do projeto específico
      return api.get(`/api/projects/${projectId}/posts/calendar?${params}`)
    },
    staleTime: 30_000, // 30 seconds
  })
}
