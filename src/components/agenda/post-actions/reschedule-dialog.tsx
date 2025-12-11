'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { usePostActions } from '@/hooks/use-post-actions'
import { toast } from 'sonner'
import { CalendarIcon, Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface RescheduleDialogProps {
  post: SocialPost
  open: boolean
  onClose: () => void
}

export function RescheduleDialog({ post, open, onClose }: RescheduleDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [selectedTime, setSelectedTime] = useState('12:00')
  const { reschedulePost } = usePostActions(post.projectId)

  // Initialize with current scheduled time
  useEffect(() => {
    if (post.scheduledDatetime) {
      const date = new Date(post.scheduledDatetime)
      setSelectedDate(date)
      setSelectedTime(
        `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      )
    }
  }, [post.scheduledDatetime])

  const handleReschedule = async () => {
    if (!selectedDate) {
      toast.error('Selecione uma data')
      return
    }

    // Combine date and time
    const [hours, minutes] = selectedTime.split(':').map(Number)
    const newDateTime = new Date(selectedDate)
    newDateTime.setHours(hours, minutes, 0, 0)

    // Validate future date
    if (newDateTime <= new Date()) {
      toast.error('A data deve ser no futuro')
      return
    }

    try {
      await reschedulePost.mutateAsync({
        postId: post.id,
        scheduledDatetime: newDateTime.toISOString(),
      })
      toast.success('Post reagendado com sucesso!')
      onClose()
    } catch (_error) {
      toast.error('Erro ao reagendar post')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Re-agendar Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current schedule */}
          <div className="p-3 bg-muted/30 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-1">Agendamento atual:</p>
            <p className="font-medium">
              {post.scheduledDatetime
                ? new Date(post.scheduledDatetime).toLocaleString('pt-BR', {
                  dateStyle: 'full',
                  timeStyle: 'short'
                })
                : 'Não agendado'}
            </p>
          </div>

          {/* New date picker */}
          <div className="space-y-2">
            <Label>Nova Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    selectedDate.toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  ) : (
                    <span>Selecione uma data</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time picker */}
          <div className="space-y-2">
            <Label htmlFor="time">Horário</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="time"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Preview */}
          {selectedDate && (
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/40">
              <p className="text-sm text-muted-foreground mb-1">Novo agendamento:</p>
              <p className="font-medium">
                {(() => {
                  const [hours, minutes] = selectedTime.split(':').map(Number)
                  const previewDate = new Date(selectedDate)
                  previewDate.setHours(hours, minutes, 0, 0)
                  return previewDate.toLocaleString('pt-BR', {
                    dateStyle: 'full',
                    timeStyle: 'short'
                  })
                })()}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleReschedule}
            disabled={!selectedDate || reschedulePost.isPending}
          >
            {reschedulePost.isPending ? 'Reagendando...' : 'Confirmar Re-agendamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
