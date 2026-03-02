"use client"

import * as React from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { cn } from '@/lib/utils'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-500',
  SCHEDULED: 'bg-amber-500',
  POSTING: 'bg-yellow-500 animate-pulse',
  POSTED: 'bg-green-500',
  FAILED: 'bg-red-500',
}

interface CalendarViewProps {
  projectId: number
  month: Date
  onMonthChange: (date: Date) => void
}

export function CalendarView({ projectId, month, onMonthChange }: CalendarViewProps) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const { data: posts, isLoading } = useAgendaPosts({
    projectId,
    startDate: calStart,
    endDate: calEnd,
  })

  const postsByDay = React.useMemo(() => {
    const map: Record<string, any[]> = {}
    if (!Array.isArray(posts)) return map
    for (const post of posts as any[]) {
      const date = post.scheduledDatetime || post.createdAt
      if (!date) continue
      const key = format(new Date(date), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(post)
    }
    return map
  }, [posts])

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="flex items-center justify-center h-8 w-8 rounded-md text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/5 transition-colors duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold text-[#FAFAFA] capitalize">
          {format(month, 'MMMM yyyy', { locale: ptBR })}
        </h3>
        <button
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="flex items-center justify-center h-8 w-8 rounded-md text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/5 transition-colors duration-200"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="rounded-lg border border-[#27272A] overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-[#27272A]">
            {weekDays.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-[10px] font-medium text-[#71717A] uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayPosts = postsByDay[key] || []
              const inMonth = isSameMonth(day, month)
              const today = isToday(day)

              return (
                <Link
                  key={key}
                  href={dayPosts.length > 0 ? `/tools/scheduler/${dayPosts[0].id}` : `/tools/scheduler/new?date=${key}`}
                  className={cn(
                    'relative min-h-[90px] border-b border-r border-[#27272A] p-1.5 transition-colors duration-200',
                    inMonth ? 'bg-[#0a0a0a]' : 'bg-[#0a0a0a]/50',
                    'hover:bg-[#161616]'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium',
                      !inMonth && 'text-[#3f3f46]',
                      inMonth && !today && 'text-[#A1A1AA]',
                      today && 'bg-amber-500 text-black font-bold'
                    )}
                  >
                    {format(day, 'd')}
                  </span>

                  {/* Post indicators */}
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {dayPosts.slice(0, 3).map((post: any) => (
                      <div
                        key={post.id}
                        className="flex items-center gap-1 rounded px-1 py-0.5 bg-[#161616]"
                      >
                        <div className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STATUS_COLORS[post.status] || 'bg-zinc-500')} />
                        <span className="text-[9px] text-[#A1A1AA] truncate">
                          {post.scheduledDatetime
                            ? format(new Date(post.scheduledDatetime), 'HH:mm')
                            : '--:--'}
                        </span>
                        {post.mediaUrls?.[0] && (
                          <img
                            src={post.mediaUrls[0]}
                            alt=""
                            className="h-4 w-4 rounded-sm object-cover flex-shrink-0 ml-auto"
                          />
                        )}
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[9px] text-[#71717A] px-1">
                        +{dayPosts.length - 3} mais
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
