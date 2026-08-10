'use client'

/**
 * Manda ao servidor o que a bancada decidiu — e só isso.
 *
 * A fila da bancada é localStorage: descartar um item, trocar a foto ou mudar
 * o horário são operações que nunca saíam do navegador. Este hook é a ponte
 * até a captura (`POST /aprendizado/desfecho`), e o contrato é o de sempre
 * nesta casa: **falha nunca derruba o fluxo principal**. Nada aqui é
 * `await`-ado por quem chama, nada lança, nada mostra toast — o sinal perdido
 * é barato; a arte que não gera porque a telemetria caiu, não.
 *
 * Não é hook de dados: sem TanStack Query, sem cache, sem estado. Um POST
 * disparado e esquecido.
 */

import * as React from 'react'
import { api } from '@/lib/api-client'
import type { Desfecho, Superficie, TipoDeSinal } from '@/lib/aprendizado/vocabulario'

interface Vinculos {
  postId?: string
  generationId?: string
  pageId?: string
  campaignId?: string
}

export interface DesfechoDeSugestao extends Vinculos {
  sugestaoId: string
  desfecho: Desfecho
  escolhido?: unknown
  diff?: unknown
}

export interface EscolhaAbsoluta extends Vinculos {
  tipo: TipoDeSinal
  escolhido: unknown
  diff?: unknown
  /**
   * Idempotência: com ela, gerar o mesmo item duas vezes (o "tentar de novo"
   * do card) registra UM sinal. O servidor namespaceia por projeto e tipo.
   */
  chave?: string
}

export function useAprendizado(projectId: number, superficie: Superficie = 'bancada') {
  const enviar = React.useCallback(
    (corpo: Record<string, unknown>) => {
      // `void` + `catch` vazio: este POST é observação, não parte do trabalho.
      void api
        .post(`/api/projects/${projectId}/aprendizado/desfecho`, { ...corpo, superficie })
        .catch((erro) => {
          console.warn('[aprendizado] sinal não registrado (seguindo sem ele):', erro)
        })
    },
    [projectId, superficie],
  )

  /** Fecha uma proposta que o servidor emitiu (slot, foto, modelo). */
  const registrarDesfecho = React.useCallback(
    (entrada: DesfechoDeSugestao) => enviar(entrada as unknown as Record<string, unknown>),
    [enviar],
  )

  /** Decisão sem proposta nenhuma — a copy que a pessoa escreveu, por exemplo. */
  const registrarEscolha = React.useCallback(
    (entrada: EscolhaAbsoluta) => enviar(entrada as unknown as Record<string, unknown>),
    [enviar],
  )

  return { registrarDesfecho, registrarEscolha }
}
