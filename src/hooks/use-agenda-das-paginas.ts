'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

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
  post: { id: string; status: string; quando: string | null } | null
}

interface AgendaDasPaginas {
  projectId: number
  paginas: AgendaDaPagina[]
}

export function useAgendaDasPaginas(templateId: number | null) {
  return useQuery<AgendaDasPaginas>({
    queryKey: ['agenda-das-paginas', templateId],
    queryFn: () => api.get(`/api/templates/${templateId}/agenda-das-paginas`),
    enabled: Boolean(templateId),
    staleTime: 30_000,
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
