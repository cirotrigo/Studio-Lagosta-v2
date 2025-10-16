'use client'

import { useState, useEffect } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarIcon, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface SchedulePickerProps {
  value?: Date
  onChange: (date: Date | undefined) => void
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const [date, setDate] = useState<Date | undefined>(value)
  const [time, setTime] = useState<string>('')

  // Initialize time from value
  useEffect(() => {
    if (value) {
      const hours = value.getHours().toString().padStart(2, '0')
      const minutes = value.getMinutes().toString().padStart(2, '0')
      setTime(`${hours}:${minutes}`)
      setDate(value)
    } else {
      // Default to tomorrow at 12:00
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(12, 0, 0, 0)
      setDate(tomorrow)
      setTime('12:00')
      onChange(tomorrow)
    }
  }, []) // Only run on mount

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return

    // Preserve time when changing date
    const [hours, minutes] = time.split(':').map(Number)
    selectedDate.setHours(hours || 12, minutes || 0, 0, 0)

    setDate(selectedDate)
    onChange(selectedDate)
  }

  const handleTimeChange = (newTime: string) => {
    setTime(newTime)

    if (!date || !newTime || !/^\d{2}:\d{2}$/.test(newTime)) return

    const [hours, minutes] = newTime.split(':').map(Number)
    const newDate = new Date(date)
    newDate.setHours(hours, minutes, 0, 0)

    setDate(newDate)
    onChange(newDate)
  }

  const now = new Date()
  const isPastDate = date && date < now

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Date Picker */}
        <div className="space-y-2">
          <Label>Data</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !date && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar data'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Time Picker */}
        <div className="space-y-2">
          <Label htmlFor="time-input">Horário</Label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="time-input"
              type="time"
              value={time}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      {date && (
        <div className={cn(
          'p-3 rounded-lg border text-sm',
          isPastDate ? 'bg-destructive/10 border-destructive/50' : 'bg-muted'
        )}>
          <p className="font-medium mb-1">
            {isPastDate ? '⚠️ Data no passado' : '📅 Agendado para:'}
          </p>
          <p className={cn(
            'font-mono',
            isPastDate ? 'text-destructive' : 'text-foreground'
          )}>
            {format(date, "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
          {isPastDate && (
            <p className="text-xs text-destructive mt-2">
              Escolha uma data e hora futuras
            </p>
          )}
        </div>
      )}

      {/* Quick shortcuts */}
      <div className="flex flex-wrap gap-2">
        <p className="text-xs text-muted-foreground w-full">Atalhos:</p>
        {[
          { label: 'Amanhã 9h', hours: 9, daysAhead: 1 },
          { label: 'Amanhã 12h', hours: 12, daysAhead: 1 },
          { label: 'Amanhã 18h', hours: 18, daysAhead: 1 },
          { label: 'Próxima semana', hours: 12, daysAhead: 7 },
        ].map((shortcut) => (
          <Button
            key={shortcut.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const quickDate = new Date()
              quickDate.setDate(quickDate.getDate() + shortcut.daysAhead)
              quickDate.setHours(shortcut.hours, 0, 0, 0)
              setDate(quickDate)
              setTime(`${shortcut.hours.toString().padStart(2, '0')}:00`)
              onChange(quickDate)
            }}
          >
            {shortcut.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
