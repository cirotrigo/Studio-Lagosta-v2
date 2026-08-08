'use client'

import type { SocialPost } from '../../../../prisma/generated/client'

/**
 * Helper function to create a date key in local timezone
 * Format: YYYY-MM-DD
 */
export function createDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * A semana começa na SEGUNDA em toda a agenda (padrão brasileiro).
 *
 * Até 08/08/2026 cada tela decidia sozinha: a agenda do projeto começava na
 * segunda, a global e as duas visões de calendário começavam no domingo. O
 * mesmo post caía em colunas diferentes dependendo de onde se olhava, e a
 * visão de semana da global buscava um range que não batia com o que
 * desenhava. Estas três funções são a fonte única — tela nova não recalcula.
 */
export function startOfWeek(date: Date): Date {
  const start = new Date(date)
  // getDay(): 0 = domingo … 6 = sábado. O +6 % 7 rotaciona para 0 = segunda.
  const offset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - offset)
  start.setHours(0, 0, 0, 0)
  return start
}

export function endOfWeek(date: Date): Date {
  const end = startOfWeek(date)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

export function getWeekRange(date: Date): { startDate: Date; endDate: Date } {
  return { startDate: startOfWeek(date), endDate: endOfWeek(date) }
}

export function getDayRange(date: Date): { startDate: Date; endDate: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { startDate: start, endDate: end }
}

/**
 * O mês INTEIRO que a grade de calendário desenha — do começo da semana em que
 * cai o dia 1 até o fim da semana em que cai o último dia.
 *
 * O preenchimento até a borda da semana não é detalhe: a grade de mês desenha
 * 42 células, então os dias do mês vizinho aparecem na tela. A agenda global
 * buscava só do dia 1 ao último e por isso mostrava aquelas células SEMPRE
 * vazias, mesmo com post marcado — a agenda do projeto já preenchia. Unificado
 * em 08/08/2026 pela versão que preenche.
 */
export function getMonthRange(date: Date): { startDate: Date; endDate: Date } {
  const start = new Date(date)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)

  const end = new Date(date)
  end.setMonth(end.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)

  return { startDate: startOfWeek(start), endDate: endOfWeek(end) }
}

/** Só o mês, do dia 1 ao último — sem os dias do mês vizinho. */
export function getStrictMonthRange(date: Date): { startDate: Date; endDate: Date } {
  const start = new Date(date)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)

  const end = new Date(date)
  end.setMonth(end.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)

  return { startDate: start, endDate: end }
}

/**
 * O período que cada visão cobre.
 *
 * Mês e grade cobrem o mesmo mês, mas com bordas diferentes de propósito: a
 * visão de MÊS desenha 42 células e precisa dos dias do mês vizinho que
 * aparecem nelas; a GRADE só lista por dia, então trazer 27 de julho debaixo
 * de um cabeçalho que diz "Agosto de 2026" seria mentira.
 */
export function getRangeForView(view: ViewMode, date: Date): { startDate: Date; endDate: Date } {
  switch (view) {
    case 'week':
      return getWeekRange(date)
    case 'day':
      return getDayRange(date)
    case 'grade':
      return getStrictMonthRange(date)
    default:
      return getMonthRange(date)
  }
}

/** Cabeçalhos na ordem em que as colunas aparecem (segunda → domingo). */
export const WEEKDAY_HEADERS = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
] as const

/** Indexado por `getDay()` — para rotular uma data qualquer. */
export const WEEKDAY_BY_INDEX = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const

/**
 * As visões da agenda. `grade` mostra a ARTE grande agrupada por dia (a visão
 * padrão no celular); as outras três são o calendário.
 *
 * O tipo vivia declarado em triplicata — no cabeçalho e nas duas agendas — e
 * já tinha divergido antes.
 */
export type ViewMode = 'grade' | 'month' | 'week' | 'day'

export const VIEW_MODES: ReadonlyArray<ViewMode> = ['grade', 'month', 'week', 'day']

export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && VIEW_MODES.includes(value as ViewMode)
}

/**
 * "Agosto de 2026" — com a primeira letra maiúscula e o resto como o
 * português manda.
 *
 * A classe `capitalize` do Tailwind põe maiúscula em TODA palavra e produzia
 * "Agosto De 2026" no cabeçalho da agenda e "Segunda-Feira, 27 De Julho" na
 * grade.
 */
export function formatMonthYear(date: Date): string {
  const texto = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * "Ago 2026" — a versão do celular, onde a linha de navegação tem 261px e
 * "Agosto de 2026" por extenso empurra a seta de avançar para fora da tela.
 */
export function formatMonthYearShort(date: Date): string {
  const mes = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${date.getFullYear()}`
}

/** Vídeo se reconhece pela extensão da URL — não há campo no banco. */
export function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']
  return videoExtensions.some((ext) => url.toLowerCase().includes(ext))
}

/**
 * A proporção real em que o post vai ao ar: 9:16 em story e reel, 4:5 no feed
 * e no carrossel (é o que `POST_TYPE_DIMENSIONS` usa ao recortar). Mostrar a
 * arte fora dela engana — o quadrado do preview antigo cortava o pé do feed.
 */
export function aspectClassForPostType(postType: string): string {
  return postType === 'STORY' || postType === 'REEL' ? 'aspect-[9/16]' : 'aspect-[4/5]'
}

export function getPostDate(post: SocialPost): Date | null {
  // Priority order:
  // 1. scheduledDatetime (set for all posts including IMMEDIATE)
  // 2. sentAt (set when post is actually sent)
  if (post.scheduledDatetime) {
    return new Date(post.scheduledDatetime)
  }

  if (post.sentAt) {
    return new Date(post.sentAt)
  }

  // Fallback to createdAt for any edge cases
  if (post.createdAt) {
    return new Date(post.createdAt)
  }

  return null
}

export function getPostDateKey(post: SocialPost): string | null {
  const date = getPostDate(post)
  if (!date) return null
  return createDateKey(date)
}

export function formatPostTime(
  post: SocialPost,
  locale: string = 'pt-BR'
): string {
  const date = getPostDate(post)
  if (!date) return '--:--'

  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Rascunho aparece na agenda mas está fora da fila de publicação: só vai para
 * o Instagram depois de aprovado. Como fica lado a lado com post que vai
 * publicar de verdade, todo card precisa marcar essa diferença.
 */
export function isRascunho(post: Pick<SocialPost, 'status'>): boolean {
  return post.status === 'DRAFT'
}

/** "seg, 04/08 às 16:00" — como a data é dita ao confirmar uma aprovação. */
export function formatPostDateTimeBR(post: SocialPost): string {
  const date = getPostDate(post)
  if (!date) return 'horário não definido'

  const dia = date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const hora = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${dia} às ${hora}`
}

export function sortPostsByDate(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => {
    const dateA = getPostDate(a)
    const dateB = getPostDate(b)

    if (!dateA || !dateB) return 0
    return dateA.getTime() - dateB.getTime()
  })
}

export function groupPostsByDay(posts: SocialPost[]) {
  const grouped = new Map<string, { date: Date; posts: SocialPost[] }>()

  posts.forEach(post => {
    const dateKey = getPostDateKey(post)
    if (!dateKey) return

    const date = getPostDate(post)
    if (!date) return

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { date, posts: [] })
    }

    grouped.get(dateKey)!.posts.push(post)
  })

  // Converter para array e ordenar por data
  return Array.from(grouped.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(group => ({
      ...group,
      dateKey: createDateKey(group.date),
      posts: sortPostsByDate(group.posts)
    }))
}
