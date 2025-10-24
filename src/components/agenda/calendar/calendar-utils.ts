'use client'

import type { SocialPost } from '../../../../prisma/generated/client'

export function getPostDate(post: SocialPost): Date | null {
  if (post.scheduledDatetime) {
    return new Date(post.scheduledDatetime)
  }

  if (post.sentAt) {
    return new Date(post.sentAt)
  }

  if (post.scheduleType === 'IMMEDIATE' && post.updatedAt) {
    return new Date(post.updatedAt)
  }

  return null
}

export function getPostDateKey(post: SocialPost): string | null {
  const date = getPostDate(post)
  if (!date) return null
  return date.toISOString().split('T')[0]
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
      dateKey: group.date.toISOString().split('T')[0],
      posts: sortPostsByDate(group.posts)
    }))
}
