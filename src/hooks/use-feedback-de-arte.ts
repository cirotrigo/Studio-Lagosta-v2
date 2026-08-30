'use client'

/**
 * O feedback da arte, do lado do navegador.
 *
 * Leitura e escrita ficam aqui porque a UI precisa das duas: o botão só pode
 * nascer MARCADO se alguém já disse o que achou — sem isso, reabrir a arte
 * pediria a mesma opinião de novo, que é o jeito mais rápido de fazer as
 * pessoas pararem de dar opinião nenhuma.
 *
 * A leitura é cache de TanStack Query (a mesma arte reaberta não repete a
 * consulta); a escrita atualiza o cache com a resposta do servidor, que é quem
 * decide se aquilo foi gravado, revisado ou já estava lá.
 *
 * ⚠️ Falha NUNCA vira toast. É opinião sobre a arte, não a arte: quem só queria
 * olhar a peça não pode ser interrompido por um erro de telemetria.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type {
  AlvoDeCorrecao,
  FeedbackDeArte,
  FotoSugerida,
  VereditoDeArte,
} from '@/lib/aprendizado/feedback-de-arte'

export interface PedidoParaEnvio {
  alvo: AlvoDeCorrecao
  texto?: string | null
  fotoSugerida?: FotoSugerida | null
}
import type { Superficie } from '@/lib/aprendizado/vocabulario'

interface RespostaDeLeitura {
  feedback: FeedbackDeArte | null
}

interface RespostaDeEscrita {
  ok: boolean
  resultado: 'gravado' | 'revisado' | 'ja-registrado' | 'erro'
  feedback: FeedbackDeArte | null
}

export function chaveDaConsulta(generationId: string | null | undefined) {
  return ['feedback-de-arte', generationId] as const
}

/** O que já foi dito sobre esta arte. `null` = ninguém opinou ainda. */
export function useFeedbackDeArte(generationId: string | null | undefined) {
  return useQuery<RespostaDeLeitura>({
    queryKey: chaveDaConsulta(generationId),
    queryFn: () => api.get<RespostaDeLeitura>(`/api/generations/${generationId}/feedback`),
    enabled: !!generationId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    // Opinião muda por clique, não por foco de janela.
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useRegistrarFeedbackDeArte(
  generationId: string | null | undefined,
  superficie: Superficie = 'galeria',
) {
  const queryClient = useQueryClient()

  return useMutation<
    RespostaDeEscrita,
    Error,
    {
      veredito: VereditoDeArte
      /** Observação GERAL (a aba sem alvo). */
      comentario?: string | null
      /** Pedidos por alvo — vários na mesma arte, um texto para cada. */
      pedidos?: PedidoParaEnvio[]
    }
  >({
    mutationFn: (entrada) =>
      api.post<RespostaDeEscrita>(`/api/generations/${generationId}/feedback`, {
        veredito: entrada.veredito,
        comentario: entrada.comentario ?? null,
        pedidos: entrada.pedidos ?? [],
        superficie,
      }),
    onSuccess: (resposta) => {
      if (!resposta?.feedback) return
      queryClient.setQueryData<RespostaDeLeitura>(chaveDaConsulta(generationId), {
        feedback: resposta.feedback,
      })
      // O selo "já revisada" da grade lê outro cache — invalidar por prefixo
      // faz o card refletir o veredito quando a pessoa volta para a agenda.
      // Literal proposital (o mesmo de CHAVE_VEREDITOS): importar o hook da
      // grade aqui só para a string criaria acoplamento sem ganho.
      queryClient.invalidateQueries({ queryKey: ['vereditos-das-artes'] })
    },
    onError: (erro) => {
      console.warn('[aprendizado] feedback não registrado (seguindo sem ele):', erro)
    },
  })
}
