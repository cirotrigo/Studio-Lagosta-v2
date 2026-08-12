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
import { useAprendizado } from '@/hooks/use-aprendizado'
import { useAvancoDoItem } from '@/hooks/use-planos'
import { slidesParaServidor } from '@/lib/planos/para-bancada'
import { useBancadaStore, type BancadaItem, type BancadaSlide } from '@/stores/bancada-store'

const POLL_MS = 5_000
/** Depois disso, um item preso em "gerando" é dado como perdido no cliente. */
const TETO_GERACAO_MS = 8 * 60_000

interface StatusResposta {
  id: string
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  resultUrl: string | null
  fieldValues?: {
    error?: string
    textCheckAlert?: string
    /** Número na arte sem lastro na copy — vem COM o texto aprovado. */
    numerosAlerta?: string
    qaEntregueComRessalva?: boolean
    qaMotivo?: string
  } | null
}

/** O aviso que o card mostra: texto divergente OU ressalva do QA visual/logo. */
function avisoDe(fv: StatusResposta['fieldValues']): string | null {
  if (!fv) return null
  return (
    fv.textCheckAlert ??
    fv.numerosAlerta ??
    (fv.qaEntregueComRessalva && fv.qaMotivo ? fv.qaMotivo : null)
  )
}

/** A copy do item, na forma que vai para o corpus: um bloco por posição. */
function copyDoItem(item: BancadaItem): string[] {
  if (item.tipo === 'carrossel') {
    return (item.slides ?? [])
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .flatMap((s) => s.copy)
  }
  return item.copy
}

export function useBancada(projectId: number) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const itens = useBancadaStore((s) => s.itens)
  const atualizar = useBancadaStore((s) => s.atualizar)
  const removerDaFila = useBancadaStore((s) => s.remover)
  const { registrarDesfecho, registrarEscolha } = useAprendizado(projectId)
  /**
   * A volta ao servidor do que este card decidiu. Só vale para o card que VEIO
   * de um plano — o montado aqui na bancada não tem item lá para mover. É
   * fire-and-forget: nada abaixo espera por ele.
   */
  const relatarAvanco = useAvancoDoItem(projectId)

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
            const erro =
              'A geração passou de 8 minutos. Ela pode ainda terminar e aparecer na galeria.'
            atualizar(item.id, { status: 'erro', erro })
            relatarAvanco(item, { para: 'erro', erro })
            return
          }
          try {
            const r = await api.get<StatusResposta>(`/api/generations/${item.generationId}`, {
              signal: AbortSignal.timeout(10_000),
            })
            if (!vivo) return
            if (r.status === 'COMPLETED') {
              atualizar(item.id, {
                status: 'pronto',
                resultUrl: r.resultUrl,
                // A arte pode sair COM aviso (texto que o comparador não achou
                // ou ressalva do QA — decisão de 10/08: entregar e deixar o
                // olho decidir; corrigir é botão com preço).
                aviso: avisoDe(r.fieldValues),
              })
              relatarAvanco(item, { para: 'pronto', generationId: item.generationId })
              queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
            } else if (r.status === 'FAILED') {
              const erro = r.fieldValues?.error ?? 'A geração falhou.'
              atualizar(item.id, { status: 'erro', erro })
              relatarAvanco(item, { para: 'erro', erro })
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
  }, [gerando, atualizar, relatarAvanco, queryClient, projectId])

  // ── Acompanhamento dos slides do carrossel ───────────────────────────────
  // Sem relato ao plano: um item de plano é sempre UMA peça (`ItemDePlano` não
  // tem slides), então carrossel é necessariamente card montado na bancada.
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
              if (r.status === 'COMPLETED') {
                return { ...slide, resultUrl: r.resultUrl, aviso: avisoDe(r.fieldValues) }
              }
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
                : {
                    status: 'pronto' as const,
                    resultUrl: novos[0]?.resultUrl ?? null,
                    aviso: (() => {
                      const comAviso = novos.filter((s) => s.aviso)
                      if (comAviso.length === 0) return null
                      return comAviso.length === 1
                        ? `Slide ${comAviso[0].ordem}: ${comAviso[0].aviso}`
                        : `Slides ${comAviso.map((s) => s.ordem).join(', ')} precisam de conferência de texto.`
                    })(),
                  }),
        })
        if (!emVoo) {
          queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
          /**
           * O desfecho da série vai ao plano com os slides completos. O passo
           * "guia pronto" fica de fora de propósito: no vocabulário do plano
           * ele ainda é `gerando`, e transição para a MESMA situação não anda
           * (`caminhoDeTransicao` devolve vazio) — os gens do guia já subiram
           * na largada.
           */
          if (falhou || !esperandoConfirmacao) {
            relatarAvanco(item, {
              para: falhou ? 'erro' : 'pronto',
              ...(falhou
                ? { erro: novos.find((s) => s.erro)?.erro ?? 'Um slide falhou.' }
                : {}),
              slides: slidesParaServidor({ slides: novos, carouselGroupId: item.carouselGroupId }),
            })
          }
        }
      }
    }

    void tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [carrosseisGerando, atualizar, relatarAvanco, queryClient, projectId])

  // ── Ações ─────────────────────────────────────────────────────────────────

  /**
   * A copy que virou arte — o sinal sai no GERAR, não no "adicionar à fila":
   * aqui o texto é o que virou trabalho pago. A chave é o id do item, então
   * "tentar de novo" no mesmo card não vira segundo sinal.
   *
   * O que o servidor faz com isto depende de ter havido PROPOSTA:
   *
   *  - card montado na bancada (ou item de leva sem dica) → **escolha
   *    absoluta**, que é o corpus das primeiras semanas: sem ele o aprendizado
   *    só passaria a existir quando o sistema já sugerisse texto — tarde demais
   *    para saber o que ele deveria sugerir;
   *  - card que veio de um item com dica de copy (`propor-semana`) → o
   *    **desfecho da dica**, calculado no servidor comparando o texto proposto
   *    com este. Mandar os dois viraria dois sinais com sentidos opostos sobre
   *    o mesmo texto — o defeito que a F1 já corrigiu uma vez no slot.
   *
   * Por isso o `itemDePlanoId` vai junto e a escolha entre os dois caminhos NÃO
   * é feita aqui: a tela não tem como comparar o que foi proposto, e quem está
   * gerando tem todo incentivo a relatar acerto.
   */
  const registrarCopyEscolhida = React.useCallback(
    (item: BancadaItem) => {
      const blocos = copyDoItem(item)
      if (blocos.length === 0) return
      registrarEscolha({
        tipo: 'copy',
        chave: `item:${item.id}`,
        ...(item.itemDePlanoId ? { itemDePlanoId: item.itemDePlanoId } : {}),
        escolhido: {
          blocos,
          formato: item.formato,
          tipoDePeca: item.tipo ?? 'peca',
          ...(item.legenda ? { legenda: item.legenda } : {}),
          ...(item.pedido ? { pedido: item.pedido } : {}),
        },
      })
    },
    [registrarEscolha],
  )

  const gerar = React.useCallback(
    async (item: BancadaItem) => {
      registrarCopyEscolhida(item)
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
        /**
         * A via do item vira `ia` quando a arte sai daqui: a bancada só tem o
         * motor de geração, e um item que o plano previa montar sobre um modelo
         * do cliente (custo de imagem zero) acabou de custar crédito. Deixar o
         * plano dizendo "template" apagaria justamente o sinal que a F3 quer —
         * qual via as pessoas realmente escolhem.
         */
        relatarAvanco(item, {
          para: 'gerando',
          generationId: resposta.generation.id,
          ...(item.via === 'template' ? { via: 'ia' as const } : {}),
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao iniciar a geração'
        atualizar(item.id, { status: 'erro', erro: msg })
        relatarAvanco(item, { para: 'erro', erro: msg })
        toast({ title: 'Não deu para gerar', description: msg, variant: 'destructive' })
      }
    },
    [atualizar, registrarCopyEscolhida, relatarAvanco, toast],
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
      registrarCopyEscolhida(item)
      atualizar(item.id, { status: 'gerando', erro: null, criadoEm: Date.now() })
      try {
        const [capaId, guiaId] = await Promise.all([
          gerarSlide(item, slides[0]),
          gerarSlide(item, slides[1]),
        ])
        const comIds = slides.map((s) =>
          s.ordem === 1 ? { ...s, generationId: capaId } : s.ordem === 2 ? { ...s, generationId: guiaId } : s,
        )
        atualizar(item.id, { slides: comIds })
        // O plano acompanha: os generationIds da capa e do guia viajam na
        // transição, e a equipe vê a série em produção de qualquer navegador.
        relatarAvanco(item, {
          para: 'gerando',
          via: 'ia',
          slides: slidesParaServidor({ slides: comIds, carouselGroupId: item.carouselGroupId }),
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao iniciar a geração'
        atualizar(item.id, { status: 'erro', erro: msg })
        relatarAvanco(item, { para: 'erro', erro: msg })
        toast({ title: 'Não deu para gerar', description: msg, variant: 'destructive' })
      }
    },
    [atualizar, gerarSlide, registrarCopyEscolhida, relatarAvanco, toast],
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
            // Escopo de aprendizado do item. "rotina" é o padrão do servidor:
            // não mandar nada quando é rotina mantém o corpo do pedido igual
            // ao de antes para o caminho comum.
            ...(item.escopo && item.escopo !== 'ROTINA'
              ? { escopo: item.escopo.toLowerCase() as 'campanha' | 'pontual' }
              : {}),
            /**
             * A sugestão de horário que este item carrega. Quem decide o
             * desfecho é o SERVIDOR, comparando o horário proposto com o
             * `quando` que chega aqui — o card deixa mudar data e hora antes
             * de agendar, e "aceitei" declarado pela tela seria só o viés de
             * quem está agendando.
             */
            ...(item.sugestaoId ? { sugestaoId: item.sugestaoId } : {}),
          },
        )
        atualizar(item.id, { status: 'agendado', postId: r.postId, quando: r.quando })
        relatarAvanco(item, { para: 'agendado', postId: r.postId })
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
    [atualizar, relatarAvanco, queryClient, toast],
  )

  /**
   * Tirar da fila — e é aqui que estava o buraco maior do aprendizado.
   *
   * O descarte é um `delete` no localStorage: a proposta de horário que a
   * pessoa jogou fora nunca chegava ao servidor, então o corpus só via o que
   * foi aceito. Item agendado NÃO conta como descarte (ele já cumpriu o
   * caminho; sumir do card é limpeza de tela).
   */
  const descartar = React.useCallback(
    (item: BancadaItem) => {
      if (item.sugestaoId && item.status !== 'agendado') {
        registrarDesfecho({
          sugestaoId: item.sugestaoId,
          desfecho: 'descartada',
          escolhido: { motivo: 'tirado da fila da bancada', estado: item.status },
          ...(item.generationId ? { generationId: item.generationId } : {}),
        })
      }
      removerDaFila(item.id)
    },
    [registrarDesfecho, removerDaFila],
  )

  return {
    itens: doProjeto,
    gerar,
    gerarCapaEGuia,
    confirmarEstilo,
    agendar,
    atualizar,
    descartar,
    remover: removerDaFila,
  }
}
