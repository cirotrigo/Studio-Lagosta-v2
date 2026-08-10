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
import { useBancadaStore, type BancadaItem, type BancadaSlide } from '@/stores/bancada-store'

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

  /** Carrosséis com slides em voo — acompanhados slide a slide. */
  const carrosseisGerando = React.useMemo(
    () =>
      doProjeto.filter(
        (i) =>
          i.tipo === 'carrossel' &&
          i.status === 'gerando' &&
          (i.slides ?? []).some((s) => s.generationId && !s.resultUrl && !s.erro),
      ),
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

  // ── Acompanhamento dos slides do carrossel ───────────────────────────────
  React.useEffect(() => {
    if (carrosseisGerando.length === 0) return
    let vivo = true

    const tick = async () => {
      for (const item of carrosseisGerando) {
        const slides = item.slides ?? []
        const pendentes = slides.filter((s) => s.generationId && !s.resultUrl && !s.erro)
        if (pendentes.length === 0) continue

        const atualizados = await Promise.all(
          pendentes.map(async (slide) => {
            try {
              const r = await api.get<StatusResposta>(`/api/generations/${slide.generationId}`, {
                signal: AbortSignal.timeout(10_000),
              })
              if (r.status === 'COMPLETED') return { ...slide, resultUrl: r.resultUrl }
              if (r.status === 'FAILED') {
                return { ...slide, erro: r.fieldValues?.error ?? 'A geração falhou.' }
              }
            } catch {
              // erro transitório: tenta no próximo tick
            }
            return slide
          }),
        )
        if (!vivo) return

        const novos = slides.map((s) => atualizados.find((a) => a.ordem === s.ordem) ?? s)
        const emVoo = novos.some((s) => s.generationId && !s.resultUrl && !s.erro)
        const falhou = novos.some((s) => s.erro)
        // Só capa e guia gerados (2 slides prontos e o resto sem generationId)
        // significa que a série está esperando a confirmação do look.
        const esperandoConfirmacao =
          !emVoo && !falhou && novos.some((s) => !s.generationId)

        atualizar(item.id, {
          slides: novos,
          ...(emVoo
            ? {}
            : falhou
              ? { status: 'erro' as const, erro: novos.find((s) => s.erro)?.erro ?? 'Um slide falhou.' }
              : esperandoConfirmacao
                ? { status: 'guia-pronto' as const }
                : { status: 'pronto' as const, resultUrl: novos[0]?.resultUrl ?? null }),
        })
        if (!emVoo) queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
      }
    }

    void tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [carrosseisGerando, atualizar, queryClient, projectId])

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

  /** Dispara UM slide e devolve o generationId. */
  const gerarSlide = React.useCallback(
    async (
      item: BancadaItem,
      slide: BancadaSlide,
      guideGenerationId?: string,
    ): Promise<string> => {
      const r = await api.post<{ generation: { id: string } }>(
        `/api/projects/${item.projectId}/arte-ia`,
        {
          track: 'arte',
          formato: item.formato,
          pedido: item.pedido.trim() || undefined,
          copy: slide.copy.length > 0 ? slide.copy : undefined,
          instrucaoImagem: item.instrucaoImagem?.trim() || null,
          referencias: [
            {
              role: slide.referencia.papel,
              ...(slide.referencia.driveFileId
                ? { driveFileId: slide.referencia.driveFileId }
                : { url: slide.referencia.url }),
              ...(slide.referencia.label ? { label: slide.referencia.label.slice(0, 80) } : {}),
            },
          ],
          carrossel: {
            groupId: item.carouselGroupId,
            slideOrder: slide.ordem,
            totalSlides: (item.slides ?? []).length,
            ...(guideGenerationId ? { guideGenerationId } : {}),
          },
        },
      )
      return r.generation.id
    },
    [],
  )

  /**
   * Etapa 1 do carrossel: capa (foto pura) + guia (slide 2, com copy).
   * Os demais só depois que a pessoa confirmar o look — é o que evita
   * produzir a série inteira no estilo errado.
   */
  const gerarCapaEGuia = React.useCallback(
    async (item: BancadaItem) => {
      const slides = item.slides ?? []
      if (slides.length < 3) return
      atualizar(item.id, { status: 'gerando', erro: null, criadoEm: Date.now() })
      try {
        const [capaId, guiaId] = await Promise.all([
          gerarSlide(item, slides[0]),
          gerarSlide(item, slides[1]),
        ])
        atualizar(item.id, {
          slides: slides.map((s) =>
            s.ordem === 1 ? { ...s, generationId: capaId } : s.ordem === 2 ? { ...s, generationId: guiaId } : s,
          ),
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao iniciar a geração'
        atualizar(item.id, { status: 'erro', erro: msg })
        toast({ title: 'Não deu para gerar', description: msg, variant: 'destructive' })
      }
    },
    [atualizar, gerarSlide, toast],
  )

  /** Etapa 2: confirmado o look, gera os slides 3..N EM PARALELO. */
  const confirmarEstilo = React.useCallback(
    async (item: BancadaItem) => {
      const slides = item.slides ?? []
      const guia = slides.find((s) => s.ordem === 2)
      if (!guia?.generationId) return
      const restantes = slides.filter((s) => s.ordem > 2)
      atualizar(item.id, { status: 'gerando', erro: null, criadoEm: Date.now() })
      try {
        const ids = await Promise.all(
          restantes.map((s) => gerarSlide(item, s, guia.generationId)),
        )
        atualizar(item.id, {
          slides: slides.map((s) => {
            const i = restantes.findIndex((r) => r.ordem === s.ordem)
            return i >= 0 ? { ...s, generationId: ids[i] } : s
          }),
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao gerar os slides'
        atualizar(item.id, { status: 'erro', erro: msg })
        toast({ title: 'Não deu para gerar os slides', description: msg, variant: 'destructive' })
      }
    },
    [atualizar, gerarSlide, toast],
  )

  const agendar = React.useCallback(
    async (item: BancadaItem, quando: string, situacao: 'rascunho' | 'agendado') => {
      const ehCarrossel = item.tipo === 'carrossel'
      // Carrossel vai como CAROUSEL com as mídias NA ORDEM dos slides; peça
      // única vai pelo generationId (o vínculo que habilita melhorar depois).
      const midias = ehCarrossel
        ? (item.slides ?? [])
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((s) => s.resultUrl)
            .filter((u): u is string => !!u)
        : []
      if (ehCarrossel ? midias.length < 2 : !item.generationId) return
      try {
        const r = await api.post<{ postId: string; quando: string; mensagem: string }>(
          `/api/projects/${item.projectId}/agendar`,
          {
            ...(ehCarrossel
              ? { mediaUrls: midias, postType: 'CAROUSEL' as const, caption: item.legenda ?? '' }
              : {
                  generationId: item.generationId,
                  postType: item.formato === 'story' ? ('STORY' as const) : ('POST' as const),
                }),
            quando,
            situacao,
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

  return {
    itens: doProjeto,
    gerar,
    gerarCapaEGuia,
    confirmarEstilo,
    agendar,
    atualizar,
    remover,
  }
}
