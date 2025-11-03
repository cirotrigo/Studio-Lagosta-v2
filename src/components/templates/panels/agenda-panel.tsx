'use client'

import * as React from 'react'
import { useAgendaPosts } from '@/hooks/use-agenda-posts'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface AgendaPanelProps {
  projectId: number
}

function getMonthStart(date: Date) {
  const start = new Date(date)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return start
}

function getMonthEnd(date: Date) {
  const end = new Date(date)
  end.setMonth(end.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)
  return end
}

function getCalendarDays(date: Date) {
  const start = new Date(date)
  start.setDate(1)

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfWeek = start.getDay()

  // Adjust to make Monday the first day (0 = Monday, 6 = Sunday)
  const mondayAdjusted = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

  // Calculate calendar start (include previous month days)
  const calendarStart = new Date(start)
  calendarStart.setDate(start.getDate() - mondayAdjusted)

  // Generate 42 days (6 weeks)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(calendarStart)
    day.setDate(calendarStart.getDate() + i)
    days.push(day)
  }

  return days
}

export function AgendaPanel({ projectId }: AgendaPanelProps) {
  const [selectedDate, setSelectedDate] = React.useState(new Date())
  const [currentMonth, setCurrentMonth] = React.useState(new Date())

  const startDate = React.useMemo(() => getMonthStart(currentMonth), [currentMonth])
  const endDate = React.useMemo(() => getMonthEnd(currentMonth), [currentMonth])

  const { data: posts, isLoading } = useAgendaPosts({
    projectId,
    startDate,
    endDate,
  })

  const postsArray = (posts as SocialPost[] | undefined) || []

  // Group posts by day
  const postsByDay = React.useMemo(() => {
    const grouped = new Map<string, SocialPost[]>()

    postsArray.forEach(post => {
      if (post.scheduledDatetime) {
        const date = new Date(post.scheduledDatetime)
        const key = date.toDateString()

        if (!grouped.has(key)) {
          grouped.set(key, [])
        }
        grouped.get(key)?.push(post)
      }
    })

    return grouped
  }, [postsArray])

  const calendarDays = React.useMemo(() => getCalendarDays(currentMonth), [currentMonth])

  const handlePreviousMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() - 1)
      return newDate
    })
  }

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + 1)
      return newDate
    })
  }

  const handleToday = () => {
    setCurrentMonth(new Date())
    setSelectedDate(new Date())
  }

  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold capitalize">{monthName}</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePreviousMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={handleToday}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week days header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Carregando...</div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
              const isToday = day.toDateString() === new Date().toDateString()
              const dayPosts = postsByDay.get(day.toDateString()) || []
              const hasPost = dayPosts.length > 0
              const isSelected = day.toDateString() === selectedDate.toDateString()

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'aspect-square rounded-md flex flex-col items-center justify-center text-xs transition-all',
                    'hover:bg-accent/50',
                    isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                    isToday && 'font-bold text-primary',
                    isSelected && 'bg-accent',
                    hasPost && 'relative'
                  )}
                >
                  <span>{day.getDate()}</span>
                  {hasPost && (
                    <div className="absolute bottom-1 flex gap-0.5">
                      {dayPosts.slice(0, 3).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-1 w-1 rounded-full',
                            isSelected ? 'bg-primary' : 'bg-primary/60'
                          )}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected Day Posts */}
      {selectedDate && (
        <div className="flex-shrink-0 border-t border-border/40 p-4 max-h-48 overflow-y-auto">
          <div className="text-xs font-semibold mb-2">
            {selectedDate.toLocaleDateString('pt-BR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </div>
          {(() => {
            const dayPosts = postsByDay.get(selectedDate.toDateString()) || []

            if (dayPosts.length === 0) {
              return (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  Nenhum post agendado
                </div>
              )
            }

            return (
              <div className="space-y-2">
                {dayPosts.map(post => (
                  <div
                    key={post.id}
                    className="p-2 rounded-md bg-accent/50 border border-border/40"
                  >
                    <div className="flex items-start gap-2">
                      <CalendarIcon className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium line-clamp-2">
                          {post.caption || 'Sem legenda'}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {post.scheduledDatetime && new Date(post.scheduledDatetime).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
