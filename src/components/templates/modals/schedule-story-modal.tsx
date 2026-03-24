'use client'

import * as React from 'react'
import { CalendarClock, Clock, Loader2, Send, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { useToast } from '@/hooks/use-toast'

interface ScheduleStoryModalProps {
  open: boolean
  onClose: () => void
  projectId: number
  templateId: number
  pageId: string
  pageThumbnail?: string | null
}

export function ScheduleStoryModal({
  open,
  onClose,
  projectId,
  templateId,
  pageId,
  pageThumbnail,
}: ScheduleStoryModalProps) {
  const { toast } = useToast()
  const { createPost } = useSocialPosts(projectId)
  const [scheduleType, setScheduleType] = React.useState<'SCHEDULED' | 'IMMEDIATE'>('SCHEDULED')
  const [selectedDate, setSelectedDate] = React.useState<Date>()
  const [selectedTime, setSelectedTime] = React.useState('12:00')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const getScheduledDate = () => {
    if (!selectedDate) return null
    const [hours, minutes] = selectedTime.split(':').map(Number)
    const date = new Date(selectedDate)
    date.setHours(hours, minutes, 0, 0)
    return date
  }

  const canSubmit = () => {
    if (isSubmitting) return false
    if (scheduleType === 'SCHEDULED') {
      const scheduled = getScheduledDate()
      if (!scheduled || scheduled <= new Date()) return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return
    setIsSubmitting(true)

    try {
      const scheduled = getScheduledDate()
      const scheduledDatetimeISO =
        scheduleType === 'SCHEDULED' && scheduled
          ? scheduled.toISOString()
          : undefined

      await createPost.mutateAsync({
        postType: 'STORY',
        caption: '',
        generationIds: [],
        mediaUrls: [],
        scheduleType,
        scheduledDatetime: scheduledDatetimeISO,
        pageId,
        templateId,
      })

      toast({
        title: scheduleType === 'IMMEDIATE'
          ? 'Story enviado para publicação!'
          : 'Story agendado com sucesso!',
        description: 'A imagem será gerada automaticamente.',
      })
      onClose()
    } catch (error) {
      console.error('[ScheduleStory] Falha:', error)
      toast({
        title: 'Falha ao agendar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar Story</DialogTitle>
          <DialogDescription>
            A imagem será gerada automaticamente a partir do template.
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        {pageThumbnail && (
          <div className="overflow-hidden rounded-lg border bg-muted">
            <img
              src={pageThumbnail}
              alt="Preview"
              className="mx-auto h-40 object-contain"
            />
          </div>
        )}

        {/* Schedule type */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={scheduleType === 'SCHEDULED' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScheduleType('SCHEDULED')}
            className="gap-2"
          >
            <CalendarClock className="h-4 w-4" />
            Agendar
          </Button>
          <Button
            variant={scheduleType === 'IMMEDIATE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScheduleType('IMMEDIATE')}
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            Postar agora
          </Button>
        </div>

        {/* Date & time picker */}
        {scheduleType === 'SCHEDULED' && (
          <div className="space-y-4">
            {/* Date picker with Calendar */}
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      selectedDate.toLocaleDateString('pt-BR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
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
              <Label htmlFor="schedule-time">Horário</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="schedule-time"
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Preview of selected datetime */}
            {selectedDate && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
                <p className="text-sm text-muted-foreground mb-1">Agendamento:</p>
                <p className="font-medium">
                  {(() => {
                    const d = getScheduledDate()
                    return d?.toLocaleString('pt-BR', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                    })
                  })()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit()}
          className="w-full gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {scheduleType === 'IMMEDIATE' ? 'Publicando...' : 'Agendando...'}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              {scheduleType === 'IMMEDIATE' ? 'Publicar agora' : 'Confirmar agendamento'}
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
