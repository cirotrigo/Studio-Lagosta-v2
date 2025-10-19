'use client'

import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { PostMiniCard } from './post-mini-card'
import { getPostDate, sortPostsByDate } from './calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface CalendarDayViewProps {
  posts: SocialPost[]
  selectedDate: Date
  onPostClick: (post: SocialPost) => void
  isLoading: boolean
}

export function CalendarDayView({
  posts,
  selectedDate,
  onPostClick,
  isLoading,
}: CalendarDayViewProps) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), [])
  const postsByHour = useMemo(() => groupPostsByHour(posts), [posts])
  const hoursWithContent = useMemo(
    () => hours.filter((hour) => (postsByHour[hour] ?? []).length > 0),
    [hours, postsByHour]
  )

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    )
  }

  const hasPosts = posts.some((post) => Boolean(getPostDate(post)))
  const hasVisiblePosts = hoursWithContent.length > 0

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold capitalize">
          {selectedDate.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </h2>
        {!hasPosts && (
          <p className="text-sm text-muted-foreground">
            Nenhum conteúdo agendado para este dia.
          </p>
        )}
      </div>

      {hasVisiblePosts ? (
        <div className="space-y-4">
          {hoursWithContent.map((hour) => {
            const items = postsByHour[hour] || []
            return (
              <div key={hour} className="flex gap-4">
                <div className="w-16 text-right text-xs text-muted-foreground">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                <div className="flex-1 space-y-2">
                  {items.map((post) => (
                    <PostMiniCard key={post.id} post={post} onClick={() => onPostClick(post)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="border border-dashed border-border/50 rounded-md p-6 text-center text-sm text-muted-foreground">
          Use o botão <span className="font-medium text-primary">Novo Post</span> para agendar conteúdos.
        </div>
      )}
    </div>
  )
}

function groupPostsByHour(posts: SocialPost[]) {
  const grouped = posts.reduce<Record<number, SocialPost[]>>((acc, post) => {
    const date = getPostDate(post)
    if (!date) return acc

    const hour = date.getHours()
    if (!acc[hour]) acc[hour] = []
    acc[hour].push(post)
    return acc
  }, {})

  Object.keys(grouped).forEach((hourKey) => {
    const hour = Number(hourKey)
    grouped[hour] = sortPostsByDate(grouped[hour])
  })

  return grouped
}
