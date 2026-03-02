import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project.store'
import { usePost, useUpdatePost } from '@/hooks/use-posts'
import { cn, formatDateTimeLocal } from '@/lib/utils'
import { ScheduleType, MAX_CAPTION_LENGTH } from '@/lib/constants'
import CaptionEditor from '@/components/post/CaptionEditor'
import SchedulePicker from '@/components/post/SchedulePicker'
import ProjectBadge from '@/components/layout/ProjectBadge'

export default function EditPostPage() {
  const navigate = useNavigate()
  const { postId } = useParams<{ postId: string }>()
  const { currentProject } = useProjectStore()
  const { data: post, isLoading } = usePost(currentProject?.id, postId)
  const updatePost = useUpdatePost(currentProject?.id, postId || '')

  const [caption, setCaption] = useState('')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('SCHEDULED')
  const [scheduledDatetime, setScheduledDatetime] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Initialize form with post data
  useEffect(() => {
    if (post && !initialized) {
      setCaption(post.caption || '')
      setScheduleType(post.scheduleType || 'SCHEDULED')
      setScheduledDatetime(
        post.scheduledDatetime ? formatDateTimeLocal(post.scheduledDatetime) : ''
      )
      setInitialized(true)
    }
  }, [post, initialized])

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-text">Selecione um projeto</h2>
          <Link to="/scheduler" className="mt-4 inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft size={16} />
            Voltar para o agendador
          </Link>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-text-muted">Carregando post...</p>
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-text">Post não encontrado</h2>
          <Link to="/scheduler" className="mt-4 inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft size={16} />
            Voltar para o agendador
          </Link>
        </div>
      </div>
    )
  }

  const canSubmit = () => {
    if (scheduleType === 'SCHEDULED') {
      if (!scheduledDatetime) return false
      if (new Date(scheduledDatetime) <= new Date()) return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return

    setIsSubmitting(true)
    try {
      const scheduledDatetimeISO = scheduleType === 'SCHEDULED' && scheduledDatetime
        ? new Date(scheduledDatetime).toISOString()
        : undefined

      await updatePost.mutateAsync({
        caption: caption.trim(),
        scheduledDatetime: scheduledDatetimeISO,
      })

      toast.success('Post atualizado com sucesso!')
      navigate('/scheduler')
    } catch (error) {
      console.error('Error updating post:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar post')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <Link to="/scheduler" className="flex items-center gap-2 text-text-muted hover:text-text">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-text">Editar Post</h1>
            <p className="text-sm text-text-muted">
              Editando post de <span className="text-primary">{currentProject.name}</span>
            </p>
          </div>
        </div>
        <ProjectBadge project={currentProject} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Current image (read-only) */}
          {post.mediaUrls[0] && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">Imagem atual</label>
              <div className="overflow-hidden rounded-lg border border-border">
                <img
                  src={post.mediaUrls[0]}
                  alt="Imagem do post"
                  className="max-h-64 w-full object-cover"
                />
              </div>
              <p className="text-xs text-text-subtle">A imagem não pode ser alterada após criação.</p>
            </div>
          )}

          {/* Caption */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Legenda</label>
            <CaptionEditor
              value={caption}
              onChange={setCaption}
              maxLength={MAX_CAPTION_LENGTH}
              projectName={currentProject.name}
              postType={post.postType as 'POST' | 'STORY' | 'REEL' | 'CAROUSEL'}
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Agendamento</label>
            <SchedulePicker
              scheduleType={scheduleType}
              onScheduleTypeChange={setScheduleType}
              scheduledDatetime={scheduledDatetime}
              onScheduledDatetimeChange={setScheduledDatetime}
            />
          </div>

          {/* Submit */}
          <div className="pt-4">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit() || isSubmitting}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary-hover',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'transition-all duration-200'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
