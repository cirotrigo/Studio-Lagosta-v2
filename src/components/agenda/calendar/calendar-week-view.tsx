'use client'

import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { PostMiniCard } from './post-mini-card'
import { DraggablePost } from './draggable-post'
import { getPostDateKey, sortPostsByDate } from './calendar-utils'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface CalendarWeekViewProps {
  posts: SocialPost[]
  selectedDate: Date
  onPostClick: (post: SocialPost) => void
  isLoading: boolean
}

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function CalendarWeekView({
  posts,
  selectedDate,
  onPostClick,
  isLoading,
}: CalendarWeekViewProps) {
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate])
  const postsByDay = useMemo(() => groupPostsByDay(posts), [posts])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayKey = day.date.toISOString().split('T')[0]
          const dayPosts = sortPostsByDate(postsByDay[dayKey] || [])

          return (
            <WeekDayColumn
              key={dayKey}
              day={day}
              posts={dayPosts}
              onPostClick={onPostClick}
            />
          )
        })}
      </div>
    </div>
  )
}

interface WeekDayColumnProps {
  day: { date: Date; isToday: boolean }
  posts: SocialPost[]
  onPostClick: (post: SocialPost) => void
}

function WeekDayColumn({ day, posts, onPostClick }: WeekDayColumnProps) {
  const dayKey = day.date.toISOString().split('T')[0]
  const { setNodeRef, isOver } = useDroppable({
    id: dayKey,
    data: { date: day.date },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-border/40 bg-card/40 p-3 space-y-3 transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary ring-inset"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase">
            {WEEKDAY_LABELS[day.date.getDay()]}
          </p>
          <p className="text-lg font-semibold">{day.date.getDate()}</p>
        </div>
        {day.isToday && (
          <span className="text-xs font-medium text-primary">Hoje</span>
        )}
      </div>

      <div className="space-y-2">
        {posts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum conteúdo agendado
          </p>
        )}

        {posts.map((post) => (
          <DraggablePost
            key={post.id}
            post={post}
            onClick={() => onPostClick(post)}
          />
        ))}
      </div>
    </div>
  )
}

function getWeekDays(date: Date) {
  const start = new Date(date)
  const day = start.getDay()
  start.setDate(start.getDate() - day)
  start.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }).map((_, index) => {
    const dayDate = new Date(start)
    dayDate.setDate(start.getDate() + index)

    const today = new Date()
    const isToday =
      dayDate.getDate() === today.getDate() &&
      dayDate.getMonth() === today.getMonth() &&
      dayDate.getFullYear() === today.getFullYear()

    return {
      date: dayDate,
      isToday,
    }
  })
}

function groupPostsByDay(posts: SocialPost[]) {
  return posts.reduce<Record<string, SocialPost[]>>((acc, post) => {
    const dayKey = getPostDateKey(post)
    if (!dayKey) return acc
    if (!acc[dayKey]) acc[dayKey] = []
    acc[dayKey].push(post)
    return acc
  }, {})
}
