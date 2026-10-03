'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Substituicao } from '@/lib/video/estado-do-video-do-post'

/**
 * A agenda das páginas de uma pasta — o horário previsto de cada peça e o
 * post que já existe.
 *
 * 🔴 Cache PRÓPRIO (`['agenda-das-paginas', templateId]`), nunca dentro de
 * `['pages', templateId]`: o autosave do editor substitui o objeto da página
 * naquele cache a cada pausa da digitação, com o retorno do PATCH — que não
 * traz estes campos. Pendurar a agenda ali a faria sumir sozinha.
 */
export interface AgendaDaPagina {
  pageId: string
  /** ISO do horário previsto na composição. `null` = a peça não sabe quando sai. */
  quando: string | null
  postType: 'STORY' | 'POST'
  /** Posição no carrossel, quando a peça é slide. */
  slide: number | null
  /** A peça é slide de carrossel: ela não se agenda sozinha. */
  ehSlide: boolean
  /**
   * `comVideo`: o post é de vídeo (`postDeVideo`). `substituivel`: vídeo ainda
   * trocável pelo editor (rascunho ou agendado, não entregue).
   * `videoDesatualizado`: a página mudou depois do vídeo. `substituicao`: a
   * troca pedida mais recente.
   */
  post: {
    id: string
    status: string
    quando: string | null
    comVideo: boolean
    substituivel: boolean
    videoDesatualizado: boolean
    substituicao: Substituicao | null
  } | null
}

interface AgendaDasPaginas {
  projectId: number
  paginas: AgendaDaPagina[]
}

/**
 * `postId`: o editor aberto pela agenda a partir de UM post. A página pode ter
 * mais de um post, e a rota devolve o mais recente — com o `postId` ela devolve
 * este, que é o que a pessoa veio editar (o vídeo trocado tem de ser o dele).
 * A chave começa por `['agenda-das-paginas', templateId]`: quem invalida por
 * esse prefixo alcança as duas formas.
 */
export function useAgendaDasPaginas(templateId: number | null, postId?: string | null) {
  return useQuery<AgendaDasPaginas>({
    queryKey: ['agenda-das-paginas', templateId, postId ?? null],
    queryFn: () =>
      api.get(
        `/api/templates/${templateId}/agenda-das-paginas${postId ? `?postId=${encodeURIComponent(postId)}` : ''}`,
      ),
    enabled: Boolean(templateId),
    staleTime: 30_000,
    // A troca de vídeo pedida termina sozinha, no servidor, sem ninguém tocar na tela.
    refetchInterval: (query) =>
      query.state.data?.paginas.some((p) => p.post?.substituicao?.estado === 'em-producao') ? 15_000 : false,
  })
}

export function useAgendarPagina(templateId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pageId: string) => api.post(`/api/templates/${templateId}/agenda-das-paginas`, { pageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-das-paginas', templateId] })
      // A agenda e a aba de templates mostram a mesma verdade por outro ângulo.
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
