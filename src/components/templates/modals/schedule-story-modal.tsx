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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api-client'
import { pollGenerationStatus } from '@/lib/ai/poll-generation'
import {
  AI_INSTRUCTION_MAX_CHARS,
  AI_INSTRUCTION_PLACEHOLDER,
  AI_IMPROVEMENT_CREDIT_COST,
} from '@/lib/ai/instruction-field'
import type { ExportRecord } from '@/contexts/template-editor-context'

interface ScheduleStoryModalProps {
  open: boolean
  onClose: () => void
  projectId: number
  templateId: number
  pageId: string
  pageThumbnail?: string | null
  /** Export current Konva stage as data URL (same as "Salvar Criativo") */
  onExportImage: () => Promise<string>
  /**
   * Exporta criando uma Generation no servidor. Só é usado quando há instrução
   * para a IA: a rota de melhoria exige um generationId, e o caminho normal de
   * agendamento (upload direto) não cria Generation nenhuma.
   */
  onExportCreative: () => Promise<ExportRecord>
}

export function ScheduleStoryModal({
  open,
  onClose,
  projectId,
  templateId,
  pageId,
  pageThumbnail,
  onExportImage,
  onExportCreative,
}: ScheduleStoryModalProps) {
  const { toast } = useToast()
  const { createPost } = useSocialPosts(projectId)
  const [scheduleType, setScheduleType] = React.useState<'SCHEDULED' | 'IMMEDIATE'>('SCHEDULED')
  const [selectedDate, setSelectedDate] = React.useState<Date>()
  const [selectedTime, setSelectedTime] = React.useState('12:00')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitStatus, setSubmitStatus] = React.useState('')
  const [aiInstruction, setAiInstruction] = React.useState('')

  React.useEffect(() => {
    if (open) setAiInstruction('')
  }, [open])

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

  /**
   * Caminho sem instrução: exporta o stage e sobe direto pro Blob. Barato,
   * síncrono e sem criar Generation — é o comportamento histórico.
   */
  const uploadStageImage = async (): Promise<string> => {
    setSubmitStatus('Gerando imagem...')
    const dataUrl = await onExportImage()

    setSubmitStatus('Enviando imagem...')
    const mimeType = dataUrl.match(/^data:([^;]+)/)?.[1] || 'image/png'
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png'
    const binaryStr = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
    const file = new File([bytes], `story-scheduled-${Date.now()}.${ext}`, { type: mimeType })

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'post')
    formData.append('postType', 'STORY')

    const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
    if (!uploadRes.ok) {
      throw new Error('Falha ao fazer upload da imagem')
    }
    const uploadData = (await uploadRes.json()) as { url: string }
    if (!uploadData?.url) {
      throw new Error('URL da imagem não retornada')
    }
    return uploadData.url
  }

  /**
   * Caminho com instrução: precisa de uma Generation para poder melhorar, e
   * precisa esperar o resultado antes de agendar — senão o post sairia com a
   * arte antiga. Se a melhoria falhar, agenda a original em vez de perder o
   * agendamento inteiro.
   */
  const improveAndGetUrl = async (instruction: string): Promise<string> => {
    setSubmitStatus('Gerando criativo...')
    const record = await onExportCreative()

    if (!record.generationId || !record.resultUrl) {
      throw new Error('O servidor não retornou o criativo gerado')
    }

    setSubmitStatus('Melhorando com IA... (pode levar até 2 min)')
    const start = await api.post<{ generation: { id: string } }>(
      `/api/generations/${record.generationId}/improve`,
      { userRequest: instruction },
    )

    const final = await pollGenerationStatus(start.generation.id)

    if (final.status === 'COMPLETED' && final.resultUrl) {
      return final.resultUrl
    }

    toast({
      title: 'Melhoria não concluída',
      description: `Agendando a arte original. Motivo: ${
        final.fieldValues?.error || 'falha desconhecida'
      }`,
      variant: 'destructive',
    })
    return record.resultUrl
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return
    setIsSubmitting(true)

    try {
      const instruction = aiInstruction.trim()
      const mediaUrl = instruction
        ? await improveAndGetUrl(instruction)
        : await uploadStageImage()

      setSubmitStatus('Criando agendamento...')
      const scheduled = getScheduledDate()
      const scheduledDatetimeISO =
        scheduleType === 'SCHEDULED' && scheduled
          ? scheduled.toISOString()
          : undefined

      await createPost.mutateAsync({
        postType: 'STORY',
        caption: '',
        generationIds: [],
        mediaUrls: [mediaUrl],
        scheduleType,
        scheduledDatetime: scheduledDatetimeISO,
        pageId,
        templateId,
      })

      toast({
        title: scheduleType === 'IMMEDIATE'
          ? 'Story enviado para publicação!'
          : 'Story agendado com sucesso!',
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
      setSubmitStatus('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar Story</DialogTitle>
          <DialogDescription>
            A imagem será exportada do editor e agendada para publicação.
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

        {/* Instrução opcional para a IA */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="schedule-ai-instruction">Instrução para a IA (opcional)</Label>
            <span className="text-xs text-muted-foreground">
              {aiInstruction.length}/{AI_INSTRUCTION_MAX_CHARS}
            </span>
          </div>
          <Textarea
            id="schedule-ai-instruction"
            placeholder={AI_INSTRUCTION_PLACEHOLDER}
            value={aiInstruction}
            onChange={(e) =>
              setAiInstruction(e.target.value.slice(0, AI_INSTRUCTION_MAX_CHARS))
            }
            rows={3}
            className="resize-none"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            {aiInstruction.trim()
              ? `A arte passa pela melhoria com IA antes de ser agendada (+${AI_IMPROVEMENT_CREDIT_COST} créditos). O agendamento espera o resultado — pode levar até 2 minutos.`
              : 'Deixe em branco para agendar a arte exatamente como está no editor.'}
          </p>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit()}
          className="w-full gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {submitStatus || 'Agendando...'}
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
