'use client'

/**
 * O plano de conteúdo (F3) visto pelo navegador.
 *
 * Duas naturezas convivem aqui, e a diferença importa:
 *
 *  - **Leitura e edição** são TanStack Query, como manda a casa: `queryKey` em
 *    array, `staleTime`/`gcTime`, e mutation que invalida. Nunca `fetch()` solto
 *    num componente.
 *  - **O avanço do card** (`useAvancoDoItem`) é fire-and-forget, no contrato de
 *    `useAprendizado`: `void` + `catch`, sem toast, sem bloquear a tela. Contar
 *    ao servidor que a arte ficou pronta não pode impedir ninguém de agendar —
 *    o registro perdido é barato, o trabalho travado não.
 */

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { caminhoDeTransicao, type PlanoDoServidor } from '@/lib/planos/para-bancada'
import { STATUS_INICIAL, type StatusDoItem, type ViaDoItem } from '@/lib/planos/vocabulario'
import { useBancadaStore } from '@/stores/bancada-store'
import type { BancadaItem } from '@/stores/bancada-store'

interface ResumoDePlano {
  id: string
  titulo: string | null
  status: string
  inicio: string
  fim: string
  totalDeItens: number
}

/** Os planos do projeto, sem os itens — a lista traz só o agregado de cada leva. */
export function usePlanosDoProjeto(projectId: number, status?: 'ativo' | 'arquivado') {
  return useQuery<ResumoDePlano[]>({
    queryKey: ['planos', projectId, status ?? 'todos'],
    queryFn: async () => {
      const r = await api.get<{ planos: ResumoDePlano[] }>(
        `/api/projects/${projectId}/planos${status ? `?status=${status}&limite=1` : ''}`,
      )
      return r.planos ?? []
    },
    enabled: Number.isFinite(projectId) && projectId > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

/** Um plano com os itens em ordem. */
export function usePlanoDeConteudo(projectId: number, planoId: string | undefined) {
  return useQuery<PlanoDoServidor>({
    queryKey: ['plano', projectId, planoId],
    queryFn: async () => {
      const r = await api.get<{ plano: PlanoDoServidor }>(
        `/api/projects/${projectId}/planos/${planoId}`,
      )
      return r.plano
    },
    enabled: !!planoId && Number.isFinite(projectId) && projectId > 0,
    // Curto de propósito: é a leva que o chat também escreve, e voltar para a
    // aba tem de trazer o que foi combinado por lá.
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  })
}

/**
 * O plano ATIVO do projeto — a leva que está rodando.
 *
 * Duas consultas encadeadas porque a lista não traz os itens (`listarPlanos`
 * pede só a situação de cada um, para não carregar a copy inteira de toda leva
 * só para contar). `resolvido` é o sinal de que a resposta CHEGOU: sem ele, a
 * hidratação não sabe distinguir "não há plano ativo" de "ainda não voltou", e
 * essa confusão apagaria cards da tela por causa de rede ruim.
 */
export function usePlanoAtivo(projectId: number) {
  const lista = usePlanosDoProjeto(projectId, 'ativo')
  const planoId = lista.data?.[0]?.id
  const detalhe = usePlanoDeConteudo(projectId, planoId)

  const semPlano = lista.isSuccess && !planoId
  const plano = semPlano ? null : (detalhe.data ?? undefined)

  return {
    plano,
    /** `true` quando já se sabe o que existe (inclusive que não existe nada). */
    resolvido: semPlano || detalhe.isSuccess,
    carregando: lista.isLoading || (!!planoId && detalhe.isLoading),
    erro: lista.error ?? detalhe.error ?? null,
  }
}

// ── Edição ──────────────────────────────────────────────────────────────────

export interface PatchDeItemDoPlano {
  planoId: string
  itemId: string
  quando?: string | null
  tema?: string | null
  copyProposta?: string[] | null
  legenda?: string | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  formato?: string
  via?: ViaDoItem
  motivoDoSlot?: string | null
  escopo?: string
  /** A nova situação, quando o gesto também move o item. */
  situacao?: StatusDoItem
  motivo?: string | null
  erro?: string | null
  generationId?: string | null
  pageId?: string | null
  postId?: string | null
}

/** Edita um item do plano. Invalida a leva para a tela acompanhar. */
export function useAtualizarItemDoPlano(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ planoId, itemId, ...corpo }: PatchDeItemDoPlano) =>
      api.patch(`/api/projects/${projectId}/planos/${planoId}/itens/${itemId}`, corpo),
    onSuccess: (_dados, variaveis) => {
      queryClient.invalidateQueries({ queryKey: ['plano', projectId, variaveis.planoId] })
      queryClient.invalidateQueries({ queryKey: ['planos', projectId] })
    },
  })
}

/** Um item como o compositor o manda ao servidor (subconjunto do itemSchema). */
export interface ItemParaAnexar {
  quando?: string | null
  tema?: string | null
  copyProposta?: string[] | null
  legenda?: string | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  formato: string
  via?: string | null
  motivoDoSlot?: string | null
  escopo?: string | null
  sugestaoId?: string | null
}

/**
 * Anexa itens ao plano ATIVO (o servidor cria um se não houver).
 *
 * É o que faz o "Adicionar à fila" valer para a EQUIPE: sem isto o item vivia
 * só no localStorage de quem clicou, e a fila de um nunca aparecia para os
 * outros.
 */
export function useAnexarItensAoPlano(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itens: ItemParaAnexar[]) =>
      api.post<{ plano: PlanoDoServidor; criados: string[] }>(
        `/api/projects/${projectId}/planos`,
        { anexarAoAtivo: true, itens },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planos', projectId] })
      queryClient.invalidateQueries({ queryKey: ['plano', projectId] })
    },
  })
}

// ── Avanço (fire-and-forget) ────────────────────────────────────────────────

interface Avanco {
  para: StatusDoItem
  generationId?: string | null
  postId?: string | null
  erro?: string | null
  /** Conteúdo a corrigir junto — vai na PRIMEIRA requisição da sequência. */
  via?: ViaDoItem
}

/**
 * Conta ao servidor que o card andou.
 *
 * O card da bancada anda mais rápido que o item do plano: quem clica em "Gerar"
 * num item `proposto` pula "na fila" na cabeça, mas o vocabulário não permite o
 * salto — a passagem pela fila é o que dá o ponto de retentativa. Por isso o
 * caminho é percorrido passo a passo (`caminhoDeTransicao`), em requisições
 * sequenciais: a segunda depende do estado que a primeira deixou.
 *
 * A situação local é adiantada ANTES do envio. Assim, se a rede cair no meio, o
 * próximo avanço parte de onde o card acha que está e o servidor recusa o passo
 * repetido com um 409 que ninguém vê — em vez de a fila ficar reenviando a
 * mesma escada para sempre. Quem corrige de verdade é a hidratação seguinte,
 * que traz a situação real.
 */
export function useAvancoDoItem(projectId: number) {
  const atualizar = useBancadaStore((s) => s.atualizar)

  return React.useCallback(
    (item: BancadaItem, avanco: Avanco) => {
      if (!item.itemDePlanoId || !item.planoId) return

      const de = item.situacaoNoPlano ?? STATUS_INICIAL
      const passos = caminhoDeTransicao(de, avanco.para)
      if (passos.length === 0) return

      atualizar(item.id, { situacaoNoPlano: avanco.para })

      void (async () => {
        for (const [indice, passo] of passos.entries()) {
          await api.patch(
            `/api/projects/${projectId}/planos/${item.planoId}/itens/${item.itemDePlanoId}`,
            {
              situacao: passo,
              // Só o último passo carrega o resultado — os intermediários são
              // passagem, e gravar o `generationId` em "na fila" diria que a
              // arte existe antes de existir.
              ...(passo === avanco.para
                ? {
                    ...(avanco.generationId ? { generationId: avanco.generationId } : {}),
                    ...(avanco.postId ? { postId: avanco.postId } : {}),
                    ...(avanco.erro ? { erro: avanco.erro.slice(0, 600) } : {}),
                  }
                : {}),
              // A via corrigida vai no primeiro passo, enquanto o item ainda
              // aceita edição de conteúdo (`itemEditavel` recusa a partir de
              // "na fila").
              ...(indice === 0 && avanco.via ? { via: avanco.via } : {}),
            },
          )
        }
      })().catch((erro) => {
        console.warn('[plano] avanço do item não registrado (seguindo sem ele):', erro)
      })
    },
    [projectId, atualizar],
  )
}

// ── Hidratação da fila ──────────────────────────────────────────────────────

/**
 * Deixa a fila da bancada em dia com o plano ativo — é aqui que o chat e a
 * bancada passam a enxergar a mesma leva.
 *
 * O efeito só dispara com a resposta na mão (`resolvido`). Chamar a hidratação
 * com a consulta em voo seria indistinguível de "o plano acabou", e cards
 * sumiriam da tela por causa de rede ruim.
 */
export function useFilaDoPlano(projectId: number) {
  const { plano, resolvido, carregando, erro } = usePlanoAtivo(projectId)
  const hidratarDoPlano = useBancadaStore((s) => s.hidratarDoPlano)

  React.useEffect(() => {
    if (!resolvido) return
    hidratarDoPlano(projectId, plano ?? null)
  }, [resolvido, plano, projectId, hidratarDoPlano])

  return { plano: plano ?? null, carregando, erro }
}
