import { useState } from 'react'
import { CalendarClock, Loader2, Send, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useCreatePost } from '@/hooks/use-posts'
import { API_BASE_URL } from '@/lib/constants'
import type { ArtFormat } from '@/types/template'

interface QuickScheduleModalProps {
  imageUrl: string
  format: ArtFormat
  projectId: number
  onClose: () => void
}

function formatToPostType(format: ArtFormat): 'STORY' | 'POST' {
  return format === 'STORY' ? 'STORY' : 'POST'
}

export function QuickScheduleModal({
  imageUrl,
  format,
  projectId,
  onClose,
}: QuickScheduleModalProps) {
  const [scheduleType, setScheduleType] = useState<'SCHEDULED' | 'IMMEDIATE'>('SCHEDULED')
  const [scheduledDatetime, setScheduledDatetime] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createPost = useCreatePost(projectId)
  const postType = formatToPostType(format)

  const canSubmit = () => {
    if (isSubmitting) return false
    if (scheduleType === 'SCHEDULED' && !scheduledDatetime) return false
    if (scheduleType === 'SCHEDULED') {
      const scheduled = new Date(scheduledDatetime)
      if (scheduled <= new Date()) return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return
    setIsSubmitting(true)

    try {
      // 1. Convert data URL to buffer and upload to Vercel Blob
      const response = await window.electronAPI.downloadBlob(imageUrl)
      if (!response.ok || !response.buffer) {
        throw new Error(response.error || 'Falha ao processar imagem.')
      }

      const uploadResponse = await window.electronAPI.uploadFile(
        `${API_BASE_URL}/api/upload`,
        {
          name: `story-${Date.now()}.jpg`,
          type: 'image/jpeg',
          buffer: response.buffer,
        },
        { type: 'post', postType },
      )

      const uploadData = uploadResponse.data as { url: string }
      if (!uploadData?.url) {
        throw new Error('Falha ao fazer upload da imagem.')
      }

      // 2. Create the post
      const scheduledDatetimeISO =
        scheduleType === 'SCHEDULED' && scheduledDatetime
          ? new Date(scheduledDatetime).toISOString()
          : undefined

      await createPost.mutateAsync({
        postType,
        caption: '',
        mediaUrls: [uploadData.url],
        scheduleType,
        scheduledDatetime: scheduledDatetimeISO,
      })

      toast.success(
        scheduleType === 'IMMEDIATE'
          ? 'Story enviado para publicação!'
          : 'Story agendado com sucesso!',
      )
      onClose()
    } catch (error) {
      console.error('[QuickSchedule] Falha:', error)
      toast.error(error instanceof Error ? error.message : 'Falha ao agendar.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Default to tomorrow at 10:00
  const getMinDatetime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 5)
    return now.toISOString().slice(0, 16)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-text-muted hover:text-text"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-text">Agendar Story</h3>
          <p className="mt-1 text-sm text-text-muted">
            Escolha quando publicar ou poste agora.
          </p>
        </div>

        {/* Preview thumbnail */}
        <div className="mb-5 overflow-hidden rounded-xl border border-border bg-[#0c111d]">
          <img
            src={imageUrl}
            alt="Preview"
            className="mx-auto h-40 object-contain"
          />
        </div>

        {/* Schedule type toggle */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScheduleType('SCHEDULED')}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              scheduleType === 'SCHEDULED'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-text-muted hover:border-primary/30'
            }`}
          >
            <CalendarClock size={16} />
            Agendar
          </button>
          <button
            type="button"
            onClick={() => setScheduleType('IMMEDIATE')}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              scheduleType === 'IMMEDIATE'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                : 'border-border bg-card text-text-muted hover:border-emerald-500/30'
            }`}
          >
            <Zap size={16} />
            Postar agora
          </button>
        </div>

        {/* Date picker (only for scheduled) */}
        {scheduleType === 'SCHEDULED' && (
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-text">
              Data e horário
            </label>
            <input
              type="datetime-local"
              value={scheduledDatetime}
              onChange={(e) => setScheduledDatetime(e.target.value)}
              min={getMinDatetime()}
              className="w-full rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {/* Submit button */}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {scheduleType === 'IMMEDIATE' ? 'Publicando...' : 'Agendando...'}
            </>
          ) : (
            <>
              <Send size={16} />
              {scheduleType === 'IMMEDIATE' ? 'Publicar agora' : 'Confirmar agendamento'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
