'use client'

/**
 * Conferência automática do crivo, para o modal da bancada.
 *
 * Degradar é o comportamento normal, não a exceção: erro de rede, 500, resposta
 * torta ou avaliação vazia com perguntas cadastradas — tudo cai no crivo de
 * leitura manual montado AQUI, com as perguntas que a tela já tem em mão. Quem
 * está agendando nunca fica travado porque o revisor automático caiu.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  crivoManual,
  type AvaliacaoDoCrivo,
  type PecaParaCrivo,
} from '@/lib/brand/approval-checklist'

interface Args {
  projectId: number
  /** As perguntas do DNA — o piso quando a conferência não responde. */
  perguntas: string[]
  peca: PecaParaCrivo | null
  /** Só roda com o modal aberto: avaliação custa uma chamada de modelo. */
  ativo: boolean
  /**
   * Muda a cada abertura do modal. Reabrir é recomeçar — avaliação de uma peça
   * anterior não pode valer para a próxima, e é a mesma regra que já zerava as
   * caixas marcadas.
   */
  sessao: number
}

export function useCrivoAvaliacao({ projectId, perguntas, peca, ativo, sessao }: Args): {
  avaliacao: AvaliacaoDoCrivo
  carregando: boolean
} {
  const habilitado = ativo && perguntas.length > 0 && peca !== null

  const { data, isFetching, isError } = useQuery<AvaliacaoDoCrivo>({
    queryKey: ['crivo-avaliacao', projectId, sessao],
    queryFn: () => api.post(`/api/projects/${projectId}/crivo/avaliar`, peca ?? {}),
    enabled: habilitado,
    // Uma avaliação por abertura: sem retry (o piso manual é melhor que fazer
    // a pessoa esperar duas vezes) e sem refetch por foco.
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  })

  const avaliacao = React.useMemo<AvaliacaoDoCrivo>(() => {
    if (isError || !data) {
      return crivoManual(perguntas, isError ? 'A conferência automática não respondeu.' : undefined)
    }
    // Avaliação sem itens com perguntas cadastradas é o caminho degradado da
    // rota (que não conhece as perguntas quando falha antes do serviço).
    if (data.itens.length === 0 && perguntas.length > 0) {
      return crivoManual(perguntas, data.motivo ?? 'A conferência automática não respondeu.')
    }
    return data
  }, [data, isError, perguntas])

  return { avaliacao, carregando: habilitado && isFetching }
}
