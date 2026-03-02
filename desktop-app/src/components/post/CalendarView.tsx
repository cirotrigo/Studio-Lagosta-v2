import { useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Post } from '@/hooks/use-posts'
import { POST_STATUS_COLORS, PostStatus } from '@/lib/constants'

interface CalendarViewProps {
  posts: Post[]
}

export default function CalendarView({ posts }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

  // Group posts by date
  const postsByDate = posts.reduce(
    (acc, post) => {
      const dateKey = post.scheduledDatetime
        ? format(new Date(post.scheduledDatetime), 'yyyy-MM-dd')
        : format(new Date(post.createdAt), 'yyyy-MM-dd')

      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(post)
      return acc
    },
    {} as Record<string, Post[]>
  )

  const renderDays = () => {
    const days = []
    let day = startDate

    while (day <= endDate) {
      const dateKey = format(day, 'yyyy-MM-dd')
      const dayPosts = postsByDate[dateKey] || []
      const isCurrentMonth = isSameMonth(day, currentMonth)
      const isToday = isSameDay(day, new Date())

      days.push(
        <div
          key={dateKey}
          className={cn(
            'min-h-[100px] border-r border-b border-border p-2',
            !isCurrentMonth && 'bg-input/50'
          )}
        >
          <div
            className={cn(
              'mb-1 text-sm',
              isToday
                ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                : isCurrentMonth
                  ? 'text-text'
                  : 'text-text-subtle'
            )}
          >
            {format(day, 'd')}
          </div>

          {/* Posts for this day */}
          <div className="space-y-1">
            {dayPosts.slice(0, 3).map((post) => (
              <div
                key={post.id}
                className={cn(
                  'truncate rounded px-1 py-0.5 text-xs text-white',
                  POST_STATUS_COLORS[post.status as PostStatus]
                )}
                title={post.caption || 'Sem legenda'}
              >
                {post.caption?.slice(0, 20) || 'Sem legenda'}
              </div>
            ))}
            {dayPosts.length > 3 && (
              <div className="text-xs text-text-muted">
                +{dayPosts.length - 3} mais
              </div>
            )}
          </div>
        </div>
      )

      day = addDays(day, 1)
    }

    return days
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-lg font-semibold text-text">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:bg-input hover:text-text"
          >
            Hoje
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
          <div
            key={day}
            className="border-r border-border p-2 text-center text-sm font-medium text-text-muted last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid flex-1 grid-cols-7 overflow-auto">{renderDays()}</div>
    </div>
  )
}
