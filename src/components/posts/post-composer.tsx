'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MediaUploadSystem } from './media-upload-system'
import { SchedulePicker } from './schedule-picker'
import { RecurringConfig } from './recurring-config'
import { toast } from 'sonner'
import { PostType, ScheduleType, RecurrenceFrequency } from '../../../prisma/generated/client'
import { Calendar, Clock, Repeat, Zap } from 'lucide-react'

const postSchema = z.object({
  postType: z.enum(['POST', 'STORY', 'REEL', 'CAROUSEL']),
  caption: z.string().max(2200, 'Máximo de 2200 caracteres'),
  mediaUrls: z.array(z.string()).min(1, 'Selecione ao menos uma mídia'),
  generationIds: z.array(z.string()),
  scheduleType: z.enum(['IMMEDIATE', 'SCHEDULED', 'RECURRING']),
  scheduledDatetime: z.date().optional(),
  recurringConfig: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    daysOfWeek: z.array(z.number()).optional(),
    time: z.string(),
    endDate: z.date().optional(),
  }).optional(),
  altText: z.array(z.string()).optional(),
  firstComment: z.string().optional(),
})

type PostFormData = z.infer<typeof postSchema>

interface MediaItem {
  id: string
  type: 'generation' | 'google-drive' | 'upload'
  url: string
  thumbnailUrl?: string
  name: string
  size?: number
  mimeType?: string
}

interface PostComposerProps {
  projectId: number
  open: boolean
  onClose: () => void
  initialData?: Partial<PostFormData>
}

export function PostComposer({ projectId, open, onClose, initialData }: PostComposerProps) {
  const { createPost } = useSocialPosts(projectId)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([])

  const form = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      postType: 'POST',
      caption: '',
      mediaUrls: [],
      generationIds: [],
      scheduleType: 'IMMEDIATE',
      altText: [],
      firstComment: '',
      ...initialData,
    },
  })

  const postType = form.watch('postType')
  const scheduleType = form.watch('scheduleType')
  const caption = form.watch('caption')

  // Calculate max media based on post type
  const maxMedia = postType === 'CAROUSEL' ? 10 : 1

  // Use ref to prevent recreating the callback
  const setSelectedMediaRef = useRef(setSelectedMedia)
  const formRef = useRef(form)

  useEffect(() => {
    setSelectedMediaRef.current = setSelectedMedia
    formRef.current = form
  }, [setSelectedMedia, form])

  // Memoize the recurring config onChange to prevent infinite loops
  const handleRecurringConfigChange = useCallback((config: any) => {
    formRef.current.setValue('recurringConfig', config)
  }, [])

  // Update form when media changes
  const handleMediaChange = useCallback((media: MediaItem[]) => {
    setSelectedMediaRef.current(media)
    formRef.current.setValue('mediaUrls', media.map(m => m.url))
    formRef.current.setValue('generationIds', media.filter(m => m.type === 'generation').map(m => m.id))
  }, [])

  const onSubmit = async (data: PostFormData) => {
    try {
      // Validate media selection based on post type
      if (postType === 'CAROUSEL' && selectedMedia.length < 2) {
        toast.error('Carrossel deve ter pelo menos 2 imgens')
        return
      }
      if (postType === 'CAROUSEL' && selectedMedia.length > 10) {
        toast.error('Carrossel deve ter no máximo 10 imagens')
        return
      }
      if (['STORY', 'REEL', 'POST'].includes(postType) && selectedMedia.length !== 1) {
        toast.error(`${postType} deve ter exatamente 1 mídia`)
        return
      }

      // Validate scheduled datetime for SCHEDULED type
      if (data.scheduleType === 'SCHEDULED') {
        if (!data.scheduledDatetime) {
          toast.error('Selecione uma data e hora para agendar')
          return
        }
        if (data.scheduledDatetime <= new Date()) {
          toast.error('Data/hora deve ser no futuro')
          return
        }
      }

      // Validate recurring config
      if (data.scheduleType === 'RECURRING' && !data.recurringConfig) {
        toast.error('Configure a recorrência')
        return
      }

      await createPost.mutateAsync({
        postType: data.postType as PostType,
        caption: data.caption,
        generationIds: data.generationIds,
        scheduleType: data.scheduleType as ScheduleType,
        scheduledDatetime: data.scheduledDatetime?.toISOString(),
        recurringConfig: data.recurringConfig ? {
          frequency: data.recurringConfig.frequency as RecurrenceFrequency,
          daysOfWeek: data.recurringConfig.daysOfWeek,
          time: data.recurringConfig.time,
          endDate: data.recurringConfig.endDate?.toISOString(),
        } : undefined,
        altText: data.altText,
        firstComment: data.firstComment,
      })

      toast.success(
        data.scheduleType === 'IMMEDIATE'
          ? 'Post enviado!'
          : data.scheduleType === 'SCHEDULED'
          ? 'Post agendado com sucesso!'
          : 'Série recorrente criada com sucesso!'
      )

      onClose()
      form.reset()
      setSelectedMedia([])
    } catch (error) {
      console.error('Error creating post:', error)
      toast.error('Erro ao criar post')
    }
  }

  const handleClose = () => {
    onClose()
    form.reset()
    setSelectedMedia([])
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? 'Editar Post' : 'Criar Novo Post'}
          </DialogTitle>
          <DialogDescription>
            Crie e agende posts para Instagram
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Tipo de Post */}
          <div>
            <Label className="text-base font-semibold">Tipo de Post</Label>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                { value: 'POST', label: 'Post', icon: '📸' },
                { value: 'STORY', label: 'Story', icon: '⭐' },
                { value: 'REEL', label: 'Reel', icon: '🎬' },
                { value: 'CAROUSEL', label: 'Carrossel', icon: '🎠' },
              ].map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={postType === type.value ? 'default' : 'outline'}
                  onClick={() => {
                    form.setValue('postType', type.value as any)
                    // Reset media if switching to/from carousel
                    if ((type.value === 'CAROUSEL' && selectedMedia.length > 10) ||
                        (type.value !== 'CAROUSEL' && selectedMedia.length > 1)) {
                      setSelectedMedia([])
                      form.setValue('mediaUrls', [])
                      form.setValue('generationIds', [])
                    }
                  }}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                >
                  <span className="text-2xl">{type.icon}</span>
                  <span className="text-xs">{type.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Seletor de Mídia */}
          <div>
            <Label className="text-base font-semibold">Mídia</Label>
            <p className="text-sm text-muted-foreground mb-3">
              {postType === 'CAROUSEL'
                ? 'Selecione de 2 a 10 imagens para o carrossel'
                : 'Selecione 1 imagem ou vídeo'}
            </p>
            <MediaUploadSystem
              projectId={projectId}
              selectedMedia={selectedMedia}
              onSelectionChange={handleMediaChange}
              maxSelection={maxMedia}
            />
          </div>

          {/* Legenda */}
          <div>
            <Label htmlFor="caption" className="text-base font-semibold">
              Legenda
            </Label>
            <Textarea
              id="caption"
              {...form.register('caption')}
              placeholder="Escreva sua legenda..."
              rows={5}
              maxLength={2200}
              className="mt-2 resize-none"
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Máximo de 2.200 caracteres
              </p>
              <p className="text-xs font-medium">
                {caption.length}/2200
              </p>
            </div>
          </div>

          {/* Primeiro Comentário (Opcional) */}
          <div>
            <Label htmlFor="firstComment" className="text-base font-semibold">
              Primeiro Comentário (Opcional)
            </Label>
            <Textarea
              id="firstComment"
              {...form.register('firstComment')}
              placeholder="Adicione um comentário que será postado automaticamente..."
              rows={2}
              className="mt-2 resize-none"
            />
          </div>

          {/* Tipo de Agendamento */}
          <div>
            <Label className="text-base font-semibold">Quando postar?</Label>
            <div className="space-y-3 mt-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  value="IMMEDIATE"
                  {...form.register('scheduleType')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span className="font-medium">Postar Agora</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    O post será enviado imediatamente
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  value="SCHEDULED"
                  {...form.register('scheduleType')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium">Agendar para Data/Hora</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Escolha quando o post será publicado
                  </p>
                </div>
              </label>

              {scheduleType === 'SCHEDULED' && (
                <div className="ml-9 pl-3 border-l-2">
                  <SchedulePicker
                    value={form.watch('scheduledDatetime')}
                    onChange={(date) => form.setValue('scheduledDatetime', date)}
                  />
                </div>
              )}

              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  value="RECURRING"
                  {...form.register('scheduleType')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4" />
                    <span className="font-medium">Postagem Recorrente</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure posts automáticos periódicos
                  </p>
                </div>
              </label>

              {scheduleType === 'RECURRING' && (
                <div className="ml-9 pl-3 border-l-2">
                  <RecurringConfig
                    value={form.watch('recurringConfig') as any}
                    onChange={handleRecurringConfigChange}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createPost.isPending || selectedMedia.length === 0}
            >
              {createPost.isPending ? 'Processando...' :
                scheduleType === 'IMMEDIATE' ? 'Postar Agora' :
                scheduleType === 'SCHEDULED' ? 'Agendar Post' :
                'Criar Série Recorrente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
