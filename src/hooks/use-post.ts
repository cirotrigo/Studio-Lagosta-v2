import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { SocialPost } from '../../prisma/generated/client'

/**
 * Um post, por id — a fonte da tela `/projects/[id]/agenda/[postId]`.
 *
 * A chave é `['social-post', postId]`, a mesma que `use-social-posts` já
 * invalida ao atualizar um post. Ações que mexem no post (publicar, aprovar,
 * voltar para rascunho, melhorar com IA) precisam invalidar esta chave
 * explicitamente: `usePostActions` e `usePostApproval` invalidam só as listas
 * (`social-posts`/`agenda-posts`), que num modal bastava porque ele fechava.
 * Numa tela que CONTINUA aberta depois da ação, a lista atualizada não
 * adianta nada.
 */
export function usePost(projectId: number, postId: string) {
  return useQuery<SocialPost>({
    queryKey: ['social-post', postId],
    queryFn: () => api.get(`/api/projects/${projectId}/posts/${postId}`),
    enabled: Number.isFinite(projectId) && !!postId,
    staleTime: 30_000,
    // Publicando e arte na fila de render são estados que mudam sozinhos, sem
    // ninguém tocar na tela. O cron de render roda a cada 2 min.
    refetchInterval: (query) => {
      const post = query.state.data
      if (!post) return false
      if (post.status === 'POSTING') return 10_000
      if (post.pageId && (post.renderStatus === 'PENDING' || post.renderStatus === 'RENDERING')) {
        return 20_000
      }
      return false
    },
  })
}
