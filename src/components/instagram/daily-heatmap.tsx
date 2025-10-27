'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DailyHeatmapProps {
  data: Array<{
    date: Date
    storiesPublished: number
    storiesGoal: number
    goalMet: boolean
  }>
}

export function DailyHeatmap({ data }: DailyHeatmapProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {data.map((day) => {
        const dayDate = new Date(day.date)
        const percentage = (day.storiesPublished / day.storiesGoal) * 100

        return (
          <div
            key={day.date.toString()}
            className={`
              relative p-3 rounded-lg text-center transition-all hover:scale-105 cursor-pointer
              ${
                day.goalMet
                  ? 'bg-green-100 border-2 border-green-500'
                  : percentage >= 66
                  ? 'bg-yellow-100 border-2 border-yellow-500'
                  : 'bg-red-100 border-2 border-red-500'
              }
            `}
            title={`${format(dayDate, 'dd/MM/yyyy', { locale: ptBR })}: ${day.storiesPublished}/${day.storiesGoal} stories`}
          >
            <div className="text-xs font-medium text-gray-600 uppercase">
              {format(dayDate, 'EEE', { locale: ptBR })}
            </div>
            <div className="text-2xl font-bold mt-1">
              {day.storiesPublished}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              /{day.storiesGoal}
            </div>
            {day.goalMet && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
