import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/** Post que a rota recusou, com o motivo pronto para mostrar na tela. */
export interface PostIgnorado {
  postId: string
  motivo: string
}

export interface ResultadoAprovacao {
  processados: string[]
  ignorados: PostIgnorado[]
  mensagem: string
}

/**
 * Aprovar leva o rascunho para a fila de publicação (e portanto para o
 * Instagram do cliente); voltar para rascunho tira de lá, inclusive do Zernio.
 * As duas direções passam pela mesma rota, que valida post a post.
 */
export function usePostApproval(projectId: number) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })
    queryClient.invalidateQueries({ queryKey: ['social-posts'] })
    queryClient.invalidateQueries({ queryKey: ['scheduled-post-counts'] })
    queryClient.invalidateQueries({ queryKey: ['next-scheduled-post'] })
  }

  const approvePosts = useMutation<ResultadoAprovacao, Error, string[]>({
    mutationFn: (postIds) =>
      api.post(`/api/projects/${projectId}/posts/approval`, {
        postIds,
        action: 'APPROVE',
      }),
    onSuccess: invalidate,
  })

  const revertToDraft = useMutation<ResultadoAprovacao, Error, string[]>({
    mutationFn: (postIds) =>
      api.post(`/api/projects/${projectId}/posts/approval`, {
        postIds,
        action: 'REVERT',
      }),
    onSuccess: invalidate,
  })

  return { approvePosts, revertToDraft }
}
