'use client'

/**
 * O veredito de várias artes de uma vez — alimenta o selo "já revisada" da
 * grade da agenda. Uma consulta por tela, nunca uma por card.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { VereditoDeArte } from '@/lib/aprendizado/feedback-de-arte'

interface RespostaDeVereditos {
  vereditos: Record<string, VereditoDeArte>
}

/** Prefixo da queryKey — o registro de feedback invalida por ele. */
export const CHAVE_VEREDITOS = 'vereditos-das-artes'

export function useVereditosDasArtes(
  projectId: number | null | undefined,
  generationIds: Array<string | null | undefined>,
) {
  // Ordenado para a queryKey ser estável entre re-renders com a mesma lista.
  const ids = Array.from(new Set(generationIds.filter((id): id is string => !!id))).sort()

  return useQuery<RespostaDeVereditos>({
    queryKey: [CHAVE_VEREDITOS, projectId, ids.join(',')],
    queryFn: () =>
      api.get<RespostaDeVereditos>(
        `/api/projects/${projectId}/feedbacks-de-arte?generationIds=${encodeURIComponent(ids.join(','))}`,
      ),
    enabled: !!projectId && ids.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
