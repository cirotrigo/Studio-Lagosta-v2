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
