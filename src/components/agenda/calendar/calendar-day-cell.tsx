'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PostMiniCard } from './post-mini-card'
import { sortPostsByDate } from './calendar-utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
  const [isExpanded, setIsExpanded] = useState(false)

  // Ordenar posts por horário de exibição (agendado ou enviado)
  const sortedPosts = sortPostsByDate(posts)
  const hasMorePosts = posts.length > 3
  const displayedPosts = isExpanded ? sortedPosts : sortedPosts.slice(0, 3)

  return (
    <div
      className={cn(
        'relative bg-background p-2 transition-all duration-300 ease-in-out',
        !isCurrentMonth && 'bg-muted/20 text-muted-foreground',
        isToday && 'ring-2 ring-inset ring-primary',
        isExpanded
          ? 'min-h-[280px] z-20 shadow-2xl rounded-lg border border-primary/30 bg-card'
          : 'min-h-[120px] hover:bg-muted/10'
      )}
    >
      {/* Número do dia */}
      <div className="flex items-center justify-between mb-2 sticky top-0 bg-inherit z-10 pb-1">
        <span
          className={cn(
            'text-sm font-medium transition-all',
            isToday && 'flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground',
            !isCurrentMonth && 'text-muted-foreground'
          )}
        >
          {day.dayNumber}
        </span>

        {/* Badge de total de posts */}
        {posts.length > 0 && (
          <span className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded-full transition-all",
            posts.length > 3
              ? "bg-primary/20 text-primary ring-1 ring-primary/30"
              : "bg-muted text-muted-foreground"
          )}>
            {posts.length}
          </span>
        )}
      </div>

      {/* Posts do dia */}
      <div className={cn(
        "space-y-1 transition-all duration-300",
        isExpanded && "max-h-[200px] overflow-y-auto pr-1 scrollbar-thin"
      )}>
        {displayedPosts.map(post => (
          <PostMiniCard
            key={post.id}
            post={post}
            onClick={() => onPostClick(post)}
          />
        ))}
      </div>

      {/* Botão Ver mais/menos */}
      {hasMorePosts && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
          className={cn(
            "w-full mt-2 py-1.5 px-2 rounded-md text-xs font-medium",
            "transition-all duration-200 flex items-center justify-center gap-1",
            "bg-primary/10 hover:bg-primary/20 text-primary",
            "border border-primary/30 hover:border-primary/50",
            "hover:shadow-md active:scale-95"
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Ver menos
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Ver mais ({posts.length - 3})
            </>
          )}
        </button>
      )}
    </div>
  )
}
