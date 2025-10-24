'use client'

import { useMemo } from 'react'
import { CalendarDayCell } from './calendar-day-cell'
import { Skeleton } from '@/components/ui/skeleton'
import { getPostDateKey, createDateKey } from './calendar-utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface CalendarGridProps {
  posts: SocialPost[]
  selectedDate: Date
  onPostClick: (post: SocialPost) => void
  isLoading: boolean
}

export function CalendarGrid({
  posts,
  selectedDate,
  onPostClick,
  isLoading
}: CalendarGridProps) {
  // Gerar dias do mês
  const calendarDays = useMemo(() => {
    return generateCalendarDays(selectedDate)
  }, [selectedDate])

  // Agrupar posts por dia
  const postsByDay = useMemo(() => {
    const grouped: Record<string, SocialPost[]> = {}

    posts.forEach(post => {
      const dayKey = getPostDateKey(post)
      if (!dayKey) return

      if (!grouped[dayKey]) grouped[dayKey] = []
      grouped[dayKey].push(post)
    })

    return grouped
  }, [posts])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header dos dias da semana */}
      <div className="grid grid-cols-7 gap-px mb-px">
        {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => (
          <div
            key={day}
            className="bg-muted/30 text-center text-sm font-semibold text-muted-foreground py-3"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-px bg-border">
        {calendarDays.map((day, index) => (
          <CalendarDayCell
            key={`${day.date}-${index}`}
            day={day}
            posts={postsByDay[day.dateKey] || []}
            isCurrentMonth={day.isCurrentMonth}
            isToday={day.isToday}
            onPostClick={onPostClick}
          />
        ))}
      </div>
    </div>
  )
}

// Helper para gerar dias do calendário
function generateCalendarDays(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDay = firstDay.getDay() // 0 = Sunday
  const daysInMonth = lastDay.getDate()

  const days: Array<{
    date: Date
    dateKey: string
    dayNumber: number
    isCurrentMonth: boolean
    isToday: boolean
  }> = []

  // Dias do mês anterior
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i
    const date = new Date(year, month - 1, day)
    days.push({
      date,
      dateKey: createDateKey(date),
      dayNumber: day,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  // Dias do mês atual
  const today = new Date()
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()

    days.push({
      date,
      dateKey: createDateKey(date),
      dayNumber: day,
      isCurrentMonth: true,
      isToday,
    })
  }

  // Dias do próximo mês (completar grade)
  const remainingDays = 42 - days.length // 6 semanas * 7 dias
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day)
    days.push({
      date,
      dateKey: createDateKey(date),
      dayNumber: day,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  return days
}
