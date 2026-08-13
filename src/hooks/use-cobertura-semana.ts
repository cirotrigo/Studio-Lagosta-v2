'use client'

/**
 * Cobertura da semana (WP5): "o que saiu, o que falta" por cliente.
 *
 * Duas leituras, nenhuma escrita:
 *
 *  - `useCoberturaDoCliente(projectId)` compõe a semana corrente (segunda a
 *    domingo, em BRT) com os posts do calendário DO PROJETO + os horários em
 *    aberto de `GET /slots`. A consulta de slots usa a MESMA queryKey do
 *    compositor da bancada (`['projeto', id, 'slots']`), então na tela da
 *    bancada é UMA ida ao servidor para os dois — e a emissão de sinal que a
 *    rota faz é idempotente por chave, por isso pode ser consultada pela tela.
 *  - `useResumoSemanaTodosClientes()` faz UMA chamada ao calendário GLOBAL e
 *    agrega por projeto no navegador. 🔴 NUNCA transformar isto em um
 *    `/slots` por cliente: a rota de slots registra sugestões (LearningSignal),
 *    e emitir sinal para cliente que ninguém abriu poluiria o denominador do
 *    KPI de aceitação.
 *
 * Horários sempre em BRT. O fuso é tratado como UTC-3 fixo — o Brasil não tem
 * horário de verão desde 2019, e é o mesmo atalho de `sugerir-posts.ts`.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { DIAS_SEMANA } from '@/lib/posts/dia-semana'

const HORA_MS = 3600_000
const DIA_MS = 24 * HORA_MS
const OFFSET_BRT_MS = 3 * HORA_MS

/** "dom", "seg"… — índice = `getUTCDay()` da data já deslocada para BRT. */
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

// ── Janela da semana corrente ───────────────────────────────────────────────

export interface JanelaDaSemana {
  /** Segunda-feira 00:00 BRT, como instante UTC. */
  inicio: Date
  /** Domingo 23:59:59.999 BRT, como instante UTC. */
  fim: Date
  /** "AAAA-MM-DD" da segunda, em calendário BRT. */
  segundaISO: string
  /** "AAAA-MM-DD" do domingo, em calendário BRT. */
  domingoISO: string
}

/**
 * Segunda a domingo da semana em que `agora` cai, no calendário de Brasília.
 * Pura e exportada para dar para conferir sem montar componente.
 */
export function janelaDaSemanaBRT(agora: Date = new Date()): JanelaDaSemana {
  const brt = new Date(agora.getTime() - OFFSET_BRT_MS)
  const desdeSegunda = (brt.getUTCDay() + 6) % 7
  const segundaMs = Date.UTC(
    brt.getUTCFullYear(),
    brt.getUTCMonth(),
    brt.getUTCDate() - desdeSegunda,
  )
  const segundaISO = new Date(segundaMs).toISOString().slice(0, 10)
  const domingoISO = new Date(segundaMs + 6 * DIA_MS).toISOString().slice(0, 10)
  const inicio = new Date(`${segundaISO}T00:00:00-03:00`)
  const fim = new Date(new Date(`${domingoISO}T00:00:00-03:00`).getTime() + DIA_MS - 1)
  return { inicio, fim, segundaISO, domingoISO }
}

// ── O que o calendário devolve (subconjunto que a cobertura usa) ───────────

type StatusDePost = 'DRAFT' | 'SCHEDULED' | 'POSTING' | 'POSTED' | 'FAILED'

interface PostDoCalendario {
  id: string
  projectId: number
  postType: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL' | string
  caption: string | null
  mediaUrls: string[] | null
  status: StatusDePost | string
  scheduledDatetime: string | null
  sentAt: string | null
  renderedImageUrl: string | null
  /** Post recorrente "expandido" pela rota — não é um post real da semana. */
  isRecurringPlaceholder?: boolean
  /** Só a rota por projeto traz — vira fallback de resumo e de capa. */
  Generation?: { templateName: string | null; resultUrl: string | null } | null
}

/** Nunca DRAFT/SCHEDULED na tela — o tipo em português natural. */
const TIPO_EM_PT: Record<string, string> = {
  POST: 'Post',
  STORY: 'Story',
  REEL: 'Reel',
  CAROUSEL: 'Carrossel',
}

export interface ItemDaCobertura {
  id: string
  /** Instante do post em ISO — publicados usam a hora real de envio quando há. */
  quando: string
  /** "19:00", já em BRT. */
  hora: string
  /** "quinta" — dia da semana por extenso, em BRT. */
  diaSemana: string
  /** "qui 19:00" — pronto para chip/linha compacta. */
  quandoCurto: string
  /** "Story", "Feed"… */
  tipo: string
  /** Primeira linha da legenda; sem legenda, o nome do modelo; senão null. */
  resumo: string | null
  capa: string | null
}

function paraItem(post: PostDoCalendario): ItemDaCobertura | null {
  const bruto =
    post.status === 'POSTED'
      ? (post.sentAt ?? post.scheduledDatetime)
      : post.scheduledDatetime
  if (!bruto) return null
  const quando = new Date(bruto)
  if (Number.isNaN(quando.getTime())) return null

  const brt = new Date(quando.getTime() - OFFSET_BRT_MS)
  const hora = quando.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
  const primeiraLinha =
    (post.caption ?? '')
      .split('\n')
      .map((linha) => linha.trim())
      .find(Boolean) ?? null

  return {
    id: post.id,
    quando: quando.toISOString(),
    hora,
    diaSemana: DIAS_SEMANA[brt.getUTCDay()],
    quandoCurto: `${DIAS_CURTOS[brt.getUTCDay()]} ${hora}`,
    tipo: TIPO_EM_PT[post.postType] ?? 'Post',
    resumo: primeiraLinha ?? post.Generation?.templateName ?? null,
    // Mesma precedência dos cards da agenda: a arte renderizada vence a mídia.
    capa: post.renderedImageUrl || post.mediaUrls?.[0] || post.Generation?.resultUrl || null,
  }
}

// ── Slots em aberto (a rota /slots, que o compositor já consulta) ──────────

export interface HorarioEmAberto {
  /** "AAAA-MM-DD" (calendário BRT). */
  data: string
  /** "quinta". */
  diaSemana: string
  /** "19:00". */
  hora: string
  /** "qui 19:00" — o chip. */
  rotulo: string
  /** "costuma postar quinta por volta das 19:00…" — vira title do chip. */
  motivo: string
  /** "AAAA-MM-DD HH:mm" — a chave estável do slot. */
  scheduledDatetime: string
}

interface SlotsResposta {
  sugestoes: Array<{
    data: string
    diaSemana: string
    hora: string
    quandoBRT: string
    scheduledDatetime: string
    motivo: string
    sugestaoId?: string
  }>
  cadencia: Array<{ diaSemana: string; horariosTipicos: string[]; postsPorSemana: number }>
  postsNoHistorico: number
  avisos: string[]
}

// ── Cobertura de UM cliente ────────────────────────────────────────────────

export interface CoberturaDoCliente {
  segundaISO: string
  domingoISO: string
  publicados: ItemDaCobertura[]
  agendados: ItemDaCobertura[]
  rascunhos: ItemDaCobertura[]
  /** Posts da semana cuja publicação falhou — contagem, para não sumir calado. */
  falharam: number
  /** Horários do ritmo do cliente ainda sem post, dentro DESTA semana. */
  horariosEmAberto: HorarioEmAberto[]
  /**
   * `false` quando o cliente não tem nenhum horário típico aprendido — aí
   * "zero em aberto" significa "sem ritmo", nunca "semana coberta".
   */
  temRitmo: boolean
}

export function useCoberturaDoCliente(projectId: number) {
  // Memoizada por montagem: `new Date()` a cada render mudaria a queryKey.
  const janela = React.useMemo(() => janelaDaSemanaBRT(), [])

  // Reusa o hook da agenda (mesma rota, mesmo cache) — com a janela da semana.
  const postsQuery = useAgendaPosts({
    projectId,
    startDate: janela.inicio,
    endDate: janela.fim,
  })

  // MESMA chave e MESMA URL do compositor da bancada: na página do projeto os
  // dois componentes dividem uma única ida ao servidor (e a emissão de sinal
  // da rota é idempotente por chave — recarregar não grava nada de novo).
  const slotsQuery = useQuery<SlotsResposta>({
    queryKey: ['projeto', projectId, 'slots'],
    queryFn: () => api.get<SlotsResposta>(`/api/projects/${projectId}/slots?dias=7`),
    staleTime: 5 * 60_000,
    enabled: Number.isFinite(projectId) && projectId > 0,
  })

  const cobertura = React.useMemo<CoberturaDoCliente | null>(() => {
    const posts = postsQuery.data as PostDoCalendario[] | undefined
    if (!posts || !Array.isArray(posts)) return null

    const publicados: ItemDaCobertura[] = []
    const agendados: ItemDaCobertura[] = []
    const rascunhos: ItemDaCobertura[] = []
    let falharam = 0

    const inicioMs = janela.inicio.getTime()
    const fimMs = janela.fim.getTime()

    for (const post of posts) {
      if (post.isRecurringPlaceholder) continue
      const item = paraItem(post)
      if (!item) continue
      const momento = new Date(item.quando).getTime()
      // A rota do projeto também devolve publicado por `sentAt` — o corte na
      // janela garante que só a semana corrente entra na conta.
      if (momento < inicioMs || momento > fimMs) continue

      if (post.status === 'POSTED') publicados.push(item)
      else if (post.status === 'SCHEDULED' || post.status === 'POSTING') agendados.push(item)
      else if (post.status === 'DRAFT') rascunhos.push(item)
      else if (post.status === 'FAILED') falharam++
    }

    const cronologica = (a: ItemDaCobertura, b: ItemDaCobertura) =>
      a.quando.localeCompare(b.quando)
    publicados.sort(cronologica)
    agendados.sort(cronologica)
    rascunhos.sort(cronologica)

    // /slots olha 7 dias à frente e pode atravessar para a semana que vem —
    // aqui só interessa o que ainda cabe ATÉ domingo. Comparação de string
    // funciona porque as datas são ISO.
    const slots = slotsQuery.data
    const horariosEmAberto: HorarioEmAberto[] = (slots?.sugestoes ?? [])
      .filter((s) => s.data >= janela.segundaISO && s.data <= janela.domingoISO)
      .map((s) => ({
        data: s.data,
        diaSemana: s.diaSemana,
        hora: s.hora,
        rotulo: `${s.diaSemana.slice(0, 3)} ${s.hora}`,
        motivo: s.motivo,
        scheduledDatetime: s.scheduledDatetime,
      }))
      .sort((a, b) => a.scheduledDatetime.localeCompare(b.scheduledDatetime))

    return {
      segundaISO: janela.segundaISO,
      domingoISO: janela.domingoISO,
      publicados,
      agendados,
      rascunhos,
      falharam,
      horariosEmAberto,
      temRitmo: (slots?.cadencia?.length ?? 0) > 0,
    }
  }, [postsQuery.data, slotsQuery.data, janela])

  return {
    cobertura,
    carregando: postsQuery.isLoading,
    erro: (postsQuery.error as Error | null) ?? null,
    /** Só com a resposta dos slots na mão dá para dizer "coberta"/"em aberto". */
    slotsResolvidos: slotsQuery.isSuccess,
    slotsErro: (slotsQuery.error as Error | null) ?? null,
  }
}

// ── Resumo da semana de TODOS os clientes (uma chamada só) ─────────────────

export interface ResumoSemanaDoProjeto {
  publicados: number
  agendados: number
  rascunhos: number
}

/**
 * Contagens da semana corrente por projeto, a partir de UMA chamada ao
 * calendário global. Projeto sem entrada no mapa = sem post na semana.
 *
 * Falha e carregamento devolvem `porProjeto: null` — o seletor de clientes
 * precisa funcionar sem o calendário, então quem consome cai no texto padrão
 * em silêncio.
 */
export function useResumoSemanaTodosClientes() {
  const janela = React.useMemo(() => janelaDaSemanaBRT(), [])

  const query = useQuery<PostDoCalendario[]>({
    queryKey: ['cobertura-semana-todos', janela.segundaISO],
    queryFn: () => {
      const params = new URLSearchParams({
        startDate: janela.inicio.toISOString(),
        endDate: janela.fim.toISOString(),
      })
      return api.get<PostDoCalendario[]>(`/api/posts/calendar?${params}`)
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const porProjeto = React.useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return null
    const mapa = new Map<number, ResumoSemanaDoProjeto>()
    for (const post of query.data) {
      if (post.isRecurringPlaceholder) continue
      const resumo = mapa.get(post.projectId) ?? { publicados: 0, agendados: 0, rascunhos: 0 }
      if (post.status === 'POSTED') resumo.publicados++
      else if (post.status === 'SCHEDULED' || post.status === 'POSTING') resumo.agendados++
      else if (post.status === 'DRAFT') resumo.rascunhos++
      else continue // FAILED fica fora dos contadores do seletor
      mapa.set(post.projectId, resumo)
    }
    return mapa
  }, [query.data])

  return {
    porProjeto,
    carregando: query.isLoading,
    erro: (query.error as Error | null) ?? null,
  }
}
