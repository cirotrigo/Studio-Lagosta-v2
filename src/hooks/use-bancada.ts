'use client'

/**
 * Ações e acompanhamento da bancada.
 *
 * Gerar é fire-and-forget: cada clique é um POST próprio que volta em ~1s com
 * o id da Generation, e o servidor segue trabalhando em background. É o que
 * permite tocar várias artes em paralelo — não há fila serial aqui de
 * propósito. O que este hook faz é ACOMPANHAR: um único intervalo consulta os
 * itens que estão gerando e atualiza a fila.
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import { useBancadaStore, type BancadaItem } from '@/stores/bancada-store'

const POLL_MS = 5_000
/** Depois disso, um item preso em "gerando" é dado como perdido no cliente. */
const TETO_GERACAO_MS = 8 * 60_000

interface StatusResposta {
  id: string
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  resultUrl: string | null
  fieldValues?: { error?: string } | null
}

export function useBancada(projectId: number) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const itens = useBancadaStore((s) => s.itens)
  const atualizar = useBancadaStore((s) => s.atualizar)
  const remover = useBancadaStore((s) => s.remover)

  const doProjeto = React.useMemo(
    () => itens.filter((i) => i.projectId === projectId),
    [itens, projectId],
  )

  const gerando = React.useMemo(
    () => doProjeto.filter((i) => i.status === 'gerando' && i.generationId),
    [doProjeto],
  )

  // ── Acompanhamento ────────────────────────────────────────────────────────
  // Um intervalo só para todos os itens; sem item gerando, nada roda.
  React.useEffect(() => {
    if (gerando.length === 0) return
    let vivo = true

    const tick = async () => {
      await Promise.all(
        gerando.map(async (item) => {
          if (!item.generationId) return
          if (Date.now() - item.criadoEm > TETO_GERACAO_MS) {
            atualizar(item.id, {
              status: 'erro',
              erro: 'A geração passou de 8 minutos. Ela pode ainda terminar e aparecer na galeria.',
            })
            return
          }
          try {
            const r = await api.get<StatusResposta>(`/api/generations/${item.generationId}`, {
              signal: AbortSignal.timeout(10_000),
            })
            if (!vivo) return
            if (r.status === 'COMPLETED') {
              atualizar(item.id, { status: 'pronto', resultUrl: r.resultUrl })
              queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
            } else if (r.status === 'FAILED') {
              atualizar(item.id, {
                status: 'erro',
                erro: r.fieldValues?.error ?? 'A geração falhou.',
              })
            }
          } catch {
            // erro transitório de rede: tenta de novo no próximo tick
          }
        }),
      )
    }

    void tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [gerando, atualizar, queryClient, projectId])

  // ── Ações ─────────────────────────────────────────────────────────────────

  const gerar = React.useCallback(
    async (item: BancadaItem) => {
      atualizar(item.id, { status: 'gerando', erro: null, criadoEm: Date.now() })
      try {
        const resposta = await api.post<{ generation: { id: string } }>(
          `/api/projects/${item.projectId}/arte-ia`,
          {
            track: item.trilha,
            formato: item.formato,
            pedido: item.pedido.trim() || undefined,
            copy: item.trilha === 'arte' ? item.copy : undefined,
            instrucaoImagem: item.instrucaoImagem?.trim() || null,
            referencias: item.referencias.map((r) => ({
              role: r.papel,
              ...(r.driveFileId ? { driveFileId: r.driveFileId } : { url: r.url }),
              ...(r.label ? { label: r.label.slice(0, 80) } : {}),
            })),
          },
        )
        atualizar(item.id, { generationId: resposta.generation.id })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao iniciar a geração'
        atualizar(item.id, { status: 'erro', erro: msg })
        toast({ title: 'Não deu para gerar', description: msg, variant: 'destructive' })
      }
    },
    [atualizar, toast],
  )

  const agendar = React.useCallback(
    async (item: BancadaItem, quando: string, situacao: 'rascunho' | 'agendado') => {
      if (!item.generationId) return
      try {
        const r = await api.post<{ postId: string; quando: string; mensagem: string }>(
          `/api/projects/${item.projectId}/agendar`,
          {
            generationId: item.generationId,
            quando,
            situacao,
            postType: item.formato === 'story' ? 'STORY' : 'POST',
          },
        )
        atualizar(item.id, { status: 'agendado', postId: r.postId, quando: r.quando })
        queryClient.invalidateQueries({ queryKey: ['social-posts', item.projectId] })
        toast({
          title: situacao === 'agendado' ? 'Agendado' : 'Salvo como rascunho na agenda',
          description: r.mensagem,
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao agendar'
        toast({ title: 'Não deu para agendar', description: msg, variant: 'destructive' })
      }
    },
    [atualizar, queryClient, toast],
  )

  return { itens: doProjeto, gerar, agendar, atualizar, remover }
}
