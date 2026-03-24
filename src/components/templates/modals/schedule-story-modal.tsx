'use client'

import * as React from 'react'
import { CalendarClock, Loader2, Send, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const [scheduledDatetime, setScheduledDatetime] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const canSubmit = () => {
    if (isSubmitting) return false
    if (scheduleType === 'SCHEDULED' && !scheduledDatetime) return false
    if (scheduleType === 'SCHEDULED') {
      const scheduled = new Date(scheduledDatetime)
      if (scheduled <= new Date()) return false
    }
    return true
  }

  const getMinDatetime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 5)
    return now.toISOString().slice(0, 16)
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return
    setIsSubmitting(true)

    try {
      const scheduledDatetimeISO =
        scheduleType === 'SCHEDULED' && scheduledDatetime
          ? new Date(scheduledDatetime).toISOString()
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
      <DialogContent className="sm:max-w-md">
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

        {/* Datetime picker */}
        {scheduleType === 'SCHEDULED' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Data e horário</label>
            <Input
              type="datetime-local"
              value={scheduledDatetime}
              onChange={(e) => setScheduledDatetime(e.target.value)}
              min={getMinDatetime()}
            />
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
