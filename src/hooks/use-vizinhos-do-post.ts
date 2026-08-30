'use client'

/**
 * Os vizinhos do post na linha do tempo da agenda — alimenta as setas de
 * "anterior/próximo" da tela do post (revisão sem voltar para a grade).
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface VizinhoDePost {
  id: string
  /** ISO — null só em teoria (post sem horário fica fora da trilha). */
  quando: string | null
  postType: string
  status: string
}

interface RespostaDeVizinhos {
  anterior: VizinhoDePost | null
  proximo: VizinhoDePost | null
}

export function useVizinhosDoPost(projectId: number, postId: string | null | undefined) {
  return useQuery<RespostaDeVizinhos>({
    queryKey: ['vizinhos-do-post', projectId, postId],
    queryFn: () => api.get<RespostaDeVizinhos>(`/api/projects/${projectId}/posts/${postId}/vizinhos`),
    enabled: !!postId && Number.isInteger(projectId),
    // Reagendamentos mudam a vizinhança — meia-vida curta, sem refetch por foco.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}
