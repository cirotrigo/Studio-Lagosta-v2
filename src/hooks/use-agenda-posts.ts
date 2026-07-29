import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
  const query = useQuery({
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
    staleTime: 2 * 60_000, // OPTIMIZED: Increased to 2 minutes for better caching
    gcTime: 5 * 60_000, // OPTIMIZED: Cache for 5 minutes
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    // OPTIMIZED: Reduced refetch frequency
    refetchInterval: (query) => {
      const data = query.state.data as any
      if (!data) return false

      // Verifica se há algum post com status POSTING
      const hasPostingPosts = data.some((post: any) => post.status === 'POSTING')
      if (hasPostingPosts) return 10000 // OPTIMIZED: Increased to 10 seconds (was 5)

      // Arte na fila de render (o cron roda a cada 2 min). Sem isto, quem
      // acabou de editar o template no editor volta para a agenda e continua
      // vendo o placeholder até recarregar a página na mão.
      const temArteGerando = data.some(
        (post: any) =>
          post.pageId && (post.renderStatus === 'PENDING' || post.renderStatus === 'RENDERING'),
      )
      return temArteGerando ? 20000 : false
    },
  })

  return query
}
