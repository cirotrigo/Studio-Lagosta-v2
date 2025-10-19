'use client'

import { cn } from '@/lib/utils'
import { PostMiniCard } from './post-mini-card'
import { sortPostsByDate } from './calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface CalendarDayCellProps {
  day: {
    date: Date
    dateKey: string
    dayNumber: number
    isCurrentMonth: boolean
    isToday: boolean
  }
  posts: SocialPost[]
  isCurrentMonth: boolean
  isToday: boolean
  onPostClick: (post: SocialPost) => void
}

export function CalendarDayCell({
  day,
  posts,
  isCurrentMonth,
  isToday,
  onPostClick
}: CalendarDayCellProps) {
  // Ordenar posts por horário de exibição (agendado ou enviado)
  const sortedPosts = sortPostsByDate(posts)

  return (
    <div
      className={cn(
        'min-h-[120px] bg-background p-2 transition-colors hover:bg-muted/10',
        !isCurrentMonth && 'bg-muted/20 text-muted-foreground',
        isToday && 'ring-2 ring-inset ring-primary'
      )}
    >
      {/* Número do dia */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            'text-sm font-medium',
            isToday && 'flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground',
            !isCurrentMonth && 'text-muted-foreground'
          )}
        >
          {day.dayNumber}
        </span>

        {/* Contador de posts (se tiver muitos) */}
        {posts.length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{posts.length - 3}
          </span>
        )}
      </div>

      {/* Posts do dia */}
      <div className="space-y-1">
        {sortedPosts.slice(0, 3).map(post => (
          <PostMiniCard
            key={post.id}
            post={post}
            onClick={() => onPostClick(post)}
          />
        ))}
      </div>
    </div>
  )
}
