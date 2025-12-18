'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PostMiniCard } from './post-mini-card'
import { DraggablePost } from './draggable-post'
import { sortPostsByDate } from './calendar-utils'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
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
  onAddPost?: (date: Date) => void
}

export function CalendarDayCell({
  day,
  posts,
  isCurrentMonth,
  isToday,
  onPostClick,
  onAddPost
}: CalendarDayCellProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { setNodeRef, isOver } = useDroppable({
    id: day.dateKey,
    data: { date: day.date },
  })

  // Ordenar posts por horário de exibição (agendado ou enviado)
  const sortedPosts = sortPostsByDate(posts)
  const hasMorePosts = posts.length > 3
  const displayedPosts = isExpanded ? sortedPosts : sortedPosts.slice(0, 3)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative bg-background p-1.5 sm:p-2 transition-all duration-300 ease-in-out',
        !isCurrentMonth && 'bg-muted/20 text-muted-foreground',
        isToday && 'ring-2 ring-inset ring-primary',
        isOver && 'bg-primary/10 ring-2 ring-primary ring-inset z-10',
        isExpanded
          ? 'min-h-[280px] z-20 shadow-2xl rounded-lg border border-primary/30 bg-card'
          : 'min-h-[100px] sm:min-h-[120px] hover:bg-muted/10'
      )}
    >
      {/* Número do dia */}
      <div className="flex items-center justify-between mb-1 sm:mb-2 sticky top-0 bg-inherit z-10 pb-0.5 sm:pb-1 group">
        <span
          className={cn(
            'text-xs sm:text-sm font-medium transition-all',
            isToday && 'flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-primary-foreground',
            !isCurrentMonth && 'text-muted-foreground'
          )}
        >
          {day.dayNumber}
        </span>

        <div className="flex items-center gap-1">
          {/* Botão + discreto */}
          {onAddPost && isCurrentMonth && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddPost(day.date)
              }}
              className={cn(
                "opacity-0 group-hover:opacity-100 transition-opacity",
                "w-4 h-4 sm:w-5 sm:h-5 rounded-full",
                "flex items-center justify-center",
                "bg-primary/10 hover:bg-primary/20",
                "text-primary hover:text-primary",
                "border border-primary/30 hover:border-primary/50",
                "active:scale-95 transition-all"
              )}
              title="Adicionar post nesta data"
            >
              <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>
          )}

          {/* Badge de total de posts */}
          {posts.length > 0 && (
            <span className={cn(
              "text-[10px] sm:text-xs font-medium px-1 sm:px-1.5 py-0.5 rounded-full transition-all",
              posts.length > 3
                ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                : "bg-muted text-muted-foreground"
            )}>
              {posts.length}
            </span>
          )}
        </div>
      </div>

      {/* Posts do dia */}
      <div className={cn(
        "space-y-1 transition-all duration-300",
        isExpanded && "max-h-[200px] overflow-y-auto pr-1 scrollbar-thin"
      )}>
        {displayedPosts.map(post => (
          <DraggablePost
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
            "w-full mt-1.5 sm:mt-2 py-1 sm:py-1.5 px-1.5 sm:px-2 rounded-md text-[10px] sm:text-xs font-medium",
            "transition-all duration-200 flex items-center justify-center gap-0.5 sm:gap-1",
            "bg-primary/10 hover:bg-primary/20 text-primary",
            "border border-primary/30 hover:border-primary/50",
            "hover:shadow-md active:scale-95"
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden sm:inline">Ver menos</span>
              <span className="sm:hidden">Menos</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden sm:inline">Ver mais ({posts.length - 3})</span>
              <span className="sm:hidden">+{posts.length - 3}</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
