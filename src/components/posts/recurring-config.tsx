'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarIcon, Clock, Info } from 'lucide-react'
import { format, addDays, addWeeks, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface RecurringConfigValue {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  daysOfWeek?: number[]
  time: string
  endDate?: Date
}

interface RecurringConfigProps {
  value?: RecurringConfigValue
  onChange: (config: RecurringConfigValue | undefined) => void
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom', fullName: 'Domingo' },
  { value: 1, label: 'Seg', fullName: 'Segunda' },
  { value: 2, label: 'Ter', fullName: 'Terça' },
  { value: 3, label: 'Qua', fullName: 'Quarta' },
  { value: 4, label: 'Qui', fullName: 'Quinta' },
  { value: 5, label: 'Sex', fullName: 'Sexta' },
  { value: 6, label: 'Sáb', fullName: 'Sábado' },
]

export function RecurringConfig({ value, onChange }: RecurringConfigProps) {
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>(
    value?.frequency || 'DAILY'
  )
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(value?.daysOfWeek || [1, 3, 5]) // Default: Mon, Wed, Fri
  const [time, setTime] = useState<string>(value?.time || '12:00')
  const [endDate, setEndDate] = useState<Date | undefined>(value?.endDate)

  // Helper function to build and notify config
  const notifyChange = (updates: Partial<{
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
    daysOfWeek: number[]
    time: string
    endDate: Date | undefined
  }>) => {
    const newFrequency = updates.frequency ?? frequency
    const newDaysOfWeek = updates.daysOfWeek ?? daysOfWeek
    const newTime = updates.time ?? time
    const newEndDate = updates.endDate !== undefined ? updates.endDate : endDate

    const config: RecurringConfigValue = {
      frequency: newFrequency,
      daysOfWeek: newFrequency === 'WEEKLY' ? newDaysOfWeek : undefined,
      time: newTime,
      endDate: newEndDate,
    }
    onChange(config)
  }

  const handleFrequencyChange = (newFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY') => {
    setFrequency(newFrequency)
    notifyChange({ frequency: newFrequency })
  }

  const handleDayToggle = (day: number) => {
    let newDays: number[]
    if (daysOfWeek.includes(day)) {
      newDays = daysOfWeek.filter(d => d !== day)
      if (newDays.length === 0) return // Don't allow empty selection
    } else {
      newDays = [...daysOfWeek, day].sort((a, b) => a - b)
    }
    setDaysOfWeek(newDays)
    notifyChange({ daysOfWeek: newDays })
  }

  const handleTimeChange = (newTime: string) => {
    setTime(newTime)
    notifyChange({ time: newTime })
  }

  const handleEndDateChange = (newEndDate: Date | undefined) => {
    setEndDate(newEndDate)
    notifyChange({ endDate: newEndDate })
  }

  // Generate preview occurrences
  const generatePreviewOccurrences = () => {
    const occurrences: Date[] = []
    const startDate = new Date()
    const maxDate = endDate || addMonths(startDate, 1)
    let currentDate = new Date(startDate)
    const [hours, minutes] = time.split(':').map(Number)

    while (occurrences.length < 5 && currentDate <= maxDate) {
      let shouldAdd = false

      if (frequency === 'DAILY') {
        shouldAdd = true
      } else if (frequency === 'WEEKLY') {
        shouldAdd = daysOfWeek.includes(currentDate.getDay())
      } else if (frequency === 'MONTHLY') {
        shouldAdd = currentDate.getDate() === startDate.getDate()
      }

      if (shouldAdd) {
        const occurrence = new Date(currentDate)
        occurrence.setHours(hours || 12, minutes || 0, 0, 0)
        if (occurrence > startDate) {
          occurrences.push(occurrence)
        }
      }

      // Increment date
      if (frequency === 'DAILY') {
        currentDate = addDays(currentDate, 1)
      } else if (frequency === 'WEEKLY') {
        currentDate = addDays(currentDate, 1)
      } else if (frequency === 'MONTHLY') {
        currentDate = addMonths(currentDate, 1)
      }
    }

    return occurrences
  }

  const previewOccurrences = generatePreviewOccurrences()

  return (
    <div className="space-y-4">
      {/* Frequency Selection */}
      <div className="space-y-2">
        <Label>Frequência</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'DAILY', label: 'Diário', icon: '📅' },
            { value: 'WEEKLY', label: 'Semanal', icon: '📆' },
            { value: 'MONTHLY', label: 'Mensal', icon: '🗓️' },
          ].map((freq) => (
            <Button
              key={freq.value}
              type="button"
              variant={frequency === freq.value ? 'default' : 'outline'}
              onClick={() => handleFrequencyChange(freq.value as any)}
              className="flex flex-col items-center gap-1 h-auto py-3"
            >
              <span className="text-xl">{freq.icon}</span>
              <span className="text-xs">{freq.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Days of Week (for WEEKLY) */}
      {frequency === 'WEEKLY' && (
        <div className="space-y-2">
          <Label>Dias da Semana</Label>
          <div className="grid grid-cols-7 gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <Button
                key={day.value}
                type="button"
                variant={daysOfWeek.includes(day.value) ? 'default' : 'outline'}
                onClick={() => handleDayToggle(day.value)}
                className="h-auto py-3"
                title={day.fullName}
              >
                {day.label}
              </Button>
            ))}
          </div>
          {daysOfWeek.length === 0 && (
            <p className="text-sm text-destructive">
              Selecione pelo menos um dia da semana
            </p>
          )}
        </div>
      )}

      {/* Time */}
      <div className="space-y-2">
        <Label htmlFor="recurring-time">Horário</Label>
        <div className="relative">
          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="recurring-time"
            type="time"
            value={time}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* End Date (Optional) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Data Final (Opcional)</Label>
          {endDate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleEndDateChange(undefined)}
            >
              Remover
            </Button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !endDate && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Sem data final'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={handleEndDateChange}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Se não definir, os posts serão criados por até 1 ano
        </p>
      </div>

      {/* Preview */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-4 h-4 mt-0.5 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium text-sm mb-1">Preview das Próximas Ocorrências</p>
            <p className="text-xs text-muted-foreground">
              Mostrando até 5 próximas postagens
            </p>
          </div>
        </div>

        {previewOccurrences.length > 0 ? (
          <div className="space-y-2">
            {previewOccurrences.map((occurrence, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded-md bg-background border"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    #{index + 1}
                  </Badge>
                  <span className="text-sm font-medium">
                    {format(occurrence, "EEE, dd/MM", { locale: ptBR })}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground font-mono">
                  {format(occurrence, 'HH:mm')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma ocorrência futura encontrada
          </p>
        )}

        {endDate && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
            Série termina em: {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
          </p>
        )}
      </Card>

      {/* Summary */}
      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-sm font-medium">
          📋 Resumo: Posts {
            frequency === 'DAILY' ? 'diários' :
            frequency === 'WEEKLY' ? `semanais (${daysOfWeek.length} dias)` :
            'mensais'
          } às {time}
          {endDate && ` até ${format(endDate, 'dd/MM/yyyy', { locale: ptBR })}`}
        </p>
      </Card>
    </div>
  )
}
