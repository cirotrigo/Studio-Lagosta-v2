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
import { isPhotoSwipeOpen, wasPhotoSwipeJustClosed } from '@/hooks/use-photoswipe'

// RecurringConfig value type (matching recurring-config.tsx)
export type RecurringConfigValue = {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  time: string
  daysOfWeek?: number[]
  endDate?: Date
}
import { toast } from 'sonner'
import { PostType, ScheduleType, RecurrenceFrequency, PublishType } from '../../../prisma/generated/client'
import { Calendar, Repeat, Zap, Wand2, Loader2 } from 'lucide-react'
import { useImproveCaption } from '@/hooks/use-improve-caption'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// Base schema - caption is optional, we validate manually based on postType
const postSchema = z.object({
  postType: z.enum(['POST', 'STORY', 'REEL', 'CAROUSEL']),
  caption: z.string().max(2200, 'Máximo de 2200 caracteres').optional().default(''),
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
  publishType: z.enum(['DIRECT', 'REMINDER']).default('DIRECT'),
  reminderExtraInfo: z.string().optional(),
})

export type PostFormData = z.infer<typeof postSchema>

interface MediaItem {
  id: string
  type: 'generation' | 'ai-image' | 'google-drive' | 'upload'
  url: string
  pathname?: string // Blob pathname for cleanup
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
  postId?: string
}

export function PostComposer({ projectId, open, onClose, initialData, postId }: PostComposerProps) {
  const { createPost, updatePost } = useSocialPosts(projectId)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([])
  const [hasInitializedMedia, setHasInitializedMedia] = useState(false)
  const isSubmittingRef = useRef(false) // Prevent double-submit
  const improveCaption = useImproveCaption()

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
      publishType: 'DIRECT',
      reminderExtraInfo: '',
      ...initialData,
    },
  })

  const postType = form.watch('postType')
  const scheduleType = form.watch('scheduleType')
  const caption = form.watch('caption')
  const recurringConfig = form.watch('recurringConfig')
  const publishType = form.watch('publishType')

  // Calculate max media based on post type
  const maxMedia = postType === 'CAROUSEL' ? 10 : 1

  // Reset publishType to DIRECT when changing to IMMEDIATE
  // (since publishType field is hidden for IMMEDIATE posts)
  useEffect(() => {
    if (scheduleType === 'IMMEDIATE') {
      form.setValue('publishType', 'DIRECT')
    }
  }, [scheduleType, form])

  // Fetch creatives to populate initial media selection
  const { data: allCreatives } = useQuery<Array<{
    id: string
    templateName: string
    resultUrl: string
    thumbnailUrl?: string
    createdAt: string
  }>>({
    queryKey: ['generations', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/creatives`),
    enabled: open && !!projectId,
  })

  // Use ref to prevent recreating the callback
  const setSelectedMediaRef = useRef(setSelectedMedia)
  const formRef = useRef(form)

  useEffect(() => {
    setSelectedMediaRef.current = setSelectedMedia
    formRef.current = form
  }, [setSelectedMedia, form])

  // Reset form with initialData when dialog opens for editing
  useEffect(() => {
    if (open && initialData) {
      form.reset({
        postType: initialData.postType || 'POST',
        caption: initialData.caption || '',
        mediaUrls: initialData.mediaUrls || [],
        generationIds: initialData.generationIds || [],
        scheduleType: initialData.scheduleType || 'IMMEDIATE',
        scheduledDatetime: initialData.scheduledDatetime,
        recurringConfig: initialData.recurringConfig,
        altText: initialData.altText || [],
        firstComment: initialData.firstComment || '',
        publishType: initialData.publishType || 'DIRECT',
      })
    } else if (open && !initialData) {
      // Reset to defaults when creating new post
      form.reset({
        postType: 'POST',
        caption: '',
        mediaUrls: [],
        generationIds: [],
        scheduleType: 'IMMEDIATE',
        altText: [],
        firstComment: '',
        publishType: 'DIRECT',
      })
    }
  }, [open, initialData, form])

  // Populate selectedMedia from initialData when dialog opens
  useEffect(() => {
    if (open && !hasInitializedMedia && initialData?.mediaUrls && initialData.mediaUrls.length > 0) {
      const initialMedia: MediaItem[] = []

      // First, try to match with creatives if we have generationIds
      if (initialData.generationIds && initialData.generationIds.length > 0 && allCreatives) {
        const mediaFromGenerations = initialData.generationIds
          .map(genId => {
            const creative = allCreatives.find(c => c.id === genId)
            if (!creative) return null

            return {
              id: creative.id,
              type: 'generation' as const,
              url: creative.resultUrl,
              thumbnailUrl: creative.thumbnailUrl || creative.resultUrl,
              name: creative.templateName || 'Criativo',
            } as MediaItem
          })
          .filter((item): item is MediaItem => item !== null)

        initialMedia.push(...mediaFromGenerations)
      }

      // For any remaining mediaUrls that weren't matched (uploads, Google Drive, etc.)
      const unmatchedUrls = initialData.mediaUrls.filter(url =>
        !initialMedia.some(media => media.url === url)
      )

      // Add unmatched URLs as upload type
      unmatchedUrls.forEach((url, index) => {
        // Determine if it's a video
        const isVideo = url.includes('.mp4') || url.includes('.mov') || url.includes('.avi')

        initialMedia.push({
          id: `existing-${index}-${Date.now()}`,
          type: 'upload' as const,
          url: url,
          thumbnailUrl: url,
          name: isVideo ? `Video ${index + 1}` : `Imagem ${index + 1}`,
        } as MediaItem)
      })

      if (initialMedia.length > 0) {
        setSelectedMedia(initialMedia)
        setHasInitializedMedia(true)
      }
    }
  }, [open, hasInitializedMedia, initialData, allCreatives])

  // Reset initialization flag and clear media when dialog closes
  useEffect(() => {
    if (!open) {
      setHasInitializedMedia(false)
      setSelectedMedia([])
    }
  }, [open])

  // Note: Stories can have captions and first comments, so we don't clear them anymore

  // Memoize the recurring config onChange to prevent infinite loops
  const handleRecurringConfigChange = useCallback((config: RecurringConfigValue | undefined) => {
    formRef.current.setValue('recurringConfig', config)
  }, [])

  // Update form when media changes
  const handleMediaChange = useCallback((media: MediaItem[]) => {
    setSelectedMediaRef.current(media)
    formRef.current.setValue('mediaUrls', media.map(m => m.url))
    formRef.current.setValue('generationIds', media.filter(m => m.type === 'generation').map(m => m.id))
  }, [])

  // Handler para melhorar legenda com IA
  const handleImproveCaption = useCallback(() => {
    const currentCaption = formRef.current.getValues('caption')
    const currentPostType = formRef.current.getValues('postType')

    if (!currentCaption?.trim()) {
      toast.error('Digite uma legenda primeiro')
      return
    }

    improveCaption.mutate(
      {
        caption: currentCaption,
        projectId,
        postType: currentPostType as 'POST' | 'STORY' | 'REEL' | 'CAROUSEL'
      },
      {
        onSuccess: (data) => {
          formRef.current.setValue('caption', data.improvedCaption)
          toast.success('Legenda melhorada!')
        },
      }
    )
  }, [projectId, improveCaption])

  const onSubmit = async (data: PostFormData) => {
    // Prevent double-submit
    if (isSubmittingRef.current) {
      console.warn('🚫 Prevented double-submit - already processing')
      return
    }

    try {
      isSubmittingRef.current = true

      // Validate caption for non-Story posts
      if (postType !== 'STORY' && (!data.caption || data.caption.trim() === '')) {
        isSubmittingRef.current = false
        toast.error('Legenda é obrigatória')
        form.setError('caption', {
          type: 'manual',
          message: 'Legenda é obrigatória',
        })
        return
      }

      // Validate media selection based on post type
      if (selectedMedia.length === 0) {
        isSubmittingRef.current = false
        toast.error('Selecione ao menos uma mídia')
        return
      }

      if (postType === 'CAROUSEL' && selectedMedia.length < 2) {
        isSubmittingRef.current = false
        toast.error('Carrossel deve ter pelo menos 2 imagens')
        return
      }
      if (postType === 'CAROUSEL' && selectedMedia.length > 10) {
        isSubmittingRef.current = false
        toast.error('Carrossel deve ter no máximo 10 imagens')
        return
      }
      if (['STORY', 'REEL', 'POST'].includes(postType) && selectedMedia.length !== 1) {
        isSubmittingRef.current = false
        toast.error(`${postType} deve ter exatamente 1 mídia`)
        return
      }

      // Validate REEL has video (not image)
      if (postType === 'REEL') {
        const hasVideo = selectedMedia.some(media => {
          const url = media.url.toLowerCase()
          return url.includes('.mp4') || url.includes('.mov') || url.includes('.avi') ||
                 url.includes('.webm') || url.includes('video') || url.includes('.m4v')
        })

        if (!hasVideo) {
          isSubmittingRef.current = false
          toast.error('Reel deve conter um vídeo (.mp4, .mov, .avi, .webm)')
          return
        }
      }

      // Validate scheduled datetime for SCHEDULED type
      if (data.scheduleType === 'SCHEDULED') {
        if (!data.scheduledDatetime) {
          isSubmittingRef.current = false
          toast.error('Selecione uma data e hora para agendar')
          return
        }
        if (data.scheduledDatetime <= new Date()) {
          isSubmittingRef.current = false
          toast.error('Data/hora deve ser no futuro')
          return
        }
      }

      // Validate recurring config
      if (data.scheduleType === 'RECURRING') {
        if (!data.recurringConfig) {
          isSubmittingRef.current = false
          toast.error('Configure a recorrência')
          return
        }
        if (!data.recurringConfig.time) {
          isSubmittingRef.current = false
          toast.error('Selecione um horário para a recorrência')
          return
        }
        if (!data.recurringConfig.frequency) {
          isSubmittingRef.current = false
          toast.error('Selecione a frequência da recorrência')
          return
        }
      }

      // Extract blobPathnames from selected media
      const blobPathnames = selectedMedia
        .filter(m => m.type === 'upload' || m.type === 'google-drive')
        .map(m => m.pathname)
        .filter(Boolean) as string[]

      const postData = {
        postType: data.postType as PostType,
        caption: data.postType === 'STORY' ? '' : (data.caption || ''), // Force empty for stories
        mediaUrls: data.mediaUrls,
        blobPathnames, // Add pathnames for cleanup
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
        publishType: data.publishType as PublishType,
        reminderExtraInfo: data.reminderExtraInfo,
      }

      console.log('📤 Sending post data:', postData)
      console.log('🔔 publishType being sent:', data.publishType)

      // Close modal immediately and process in background
      // This improves UX especially for carousel posts that take longer
      onClose()
      form.reset()
      setSelectedMedia([])

      if (postId) {
        // Update existing post
        updatePost.mutate({
          postId,
          data: postData,
        }, {
          onSuccess: () => {
            toast.success('✅ Post atualizado com sucesso!')
          },
          onError: (error) => {
            console.error('Error updating post:', error)
            const message = error instanceof Error ? error.message : 'Erro ao atualizar post'
            toast.error(`❌ ${message}`)
          }
        })
      } else {
        // Show immediate feedback
        if (data.scheduleType === 'IMMEDIATE') {
          toast.success('📤 Enviando post... Acompanhe o status na agenda.')
        } else if (data.scheduleType === 'SCHEDULED') {
          const dateStr = data.scheduledDatetime?.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
          toast.success(`📅 Agendando post para ${dateStr}...`)
        } else {
          toast.success('🔄 Criando série recorrente...')
        }

        // Create new post in background
        createPost.mutate(postData, {
          onSuccess: () => {
            if (data.scheduleType === 'IMMEDIATE') {
              toast.success('✅ Post publicado com sucesso!')
            } else if (data.scheduleType === 'SCHEDULED') {
              toast.success('✅ Post agendado com sucesso!')
            } else {
              toast.success('✅ Série recorrente criada!')
            }
          },
          onError: (error) => {
            console.error('Error creating post:', error)
            const message = error instanceof Error ? error.message : 'Erro ao criar post'
            toast.error(`❌ ${message}`)
          }
        })
      }

      // Return early since we already closed the modal
      return
    } catch (error) {
      // This catch block handles validation errors before mutation starts
      console.error('Error preparing post:', error)

      if (error instanceof Error) {
        toast.error(`❌ Erro: ${error.message}`)
      } else {
        toast.error('❌ Erro ao preparar post. Verifique os dados e tente novamente.')
      }
    } finally {
      // Always reset the submitting flag
      isSubmittingRef.current = false
    }
  }

  const handleClose = useCallback(() => {
    // Prevenir fechamento do Dialog se PhotoSwipe estiver aberto ou acabou de fechar
    if (isPhotoSwipeOpen() || wasPhotoSwipeJustClosed()) {
      console.log('🛡️ PostComposer: Close prevented because PhotoSwipe is open or just closed')
      return
    }

    onClose()
    form.reset()
    setSelectedMedia([])
  }, [onClose, form])

  // Handler para onOpenChange do Dialog que verifica PhotoSwipe
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // Se está tentando fechar, verificar PhotoSwipe
      if (isPhotoSwipeOpen() || wasPhotoSwipeJustClosed()) {
        console.log('🛡️ PostComposer: Dialog close prevented because PhotoSwipe is open or just closed')
        return
      }
      handleClose()
    }
  }, [handleClose])

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-[1400px] max-h-[90vh] overflow-y-auto">
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
                    form.setValue('postType', type.value as PostFormData['postType'])

                    // Reset media if switching to/from carousel
                    if ((type.value === 'CAROUSEL' && selectedMedia.length > 10) ||
                      (type.value !== 'CAROUSEL' && selectedMedia.length > 1)) {
                      setSelectedMedia([])
                      form.setValue('mediaUrls', [])
                      form.setValue('generationIds', [])
                    }

                    // Clear firstComment if switching to STORY or REEL (they don't support first comment)
                    if (type.value === 'STORY' || type.value === 'REEL') {
                      form.setValue('firstComment', '')
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
            <Label className="text-base font-semibold">
              Mídia
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              {postType === 'CAROUSEL'
                ? '📸 Selecione de 2 a 10 imagens para o carrossel (apenas imagens)'
                : postType === 'REEL'
                  ? '🎬 Selecione 1 vídeo para o reel (.mp4, .mov, .avi ou .webm)'
                  : postType === 'STORY'
                    ? '⭐ Selecione 1 imagem ou vídeo para o story (24h de duração)'
                    : '📷 Selecione 1 imagem para o post'}
            </p>
            <MediaUploadSystem
              projectId={projectId}
              selectedMedia={selectedMedia}
              onSelectionChange={handleMediaChange}
              maxSelection={maxMedia}
              postType={postType}
            />
          </div>

          {/* Legenda */}
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="caption" className="text-base font-semibold">
                {postType === 'STORY' ? 'Texto do Story (Opcional)' : 'Legenda'}
                {postType !== 'STORY' && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleImproveCaption}
                disabled={improveCaption.isPending || !caption?.trim()}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                {improveCaption.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Melhorando...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3 h-3" />
                    Melhorar legenda
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="caption"
              {...form.register('caption')}
              placeholder={postType === 'STORY' ? 'Adicione texto que aparecerá no story...' : 'Escreva sua legenda...'}
              rows={5}
              maxLength={2200}
              className="mt-2 resize-none"
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                {postType === 'STORY'
                  ? '💡 Texto opcional. Stories são temporários e duram 24 horas'
                  : postType === 'REEL'
                    ? '💡 Use hashtags e mencione perfis para aumentar o alcance'
                    : '💡 Máximo de 2.200 caracteres. Use hashtags relevantes'}
              </p>
              <p className="text-xs font-medium">
                {caption?.length || 0}/2200
              </p>
            </div>
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
                    value={recurringConfig as RecurringConfigValue | undefined}
                    onChange={handleRecurringConfigChange}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tipo de Publicação - Apenas para posts agendados */}
          {scheduleType !== 'IMMEDIATE' && (
            <div>
              <Label className="text-base font-semibold">Tipo de Publicação</Label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                  <input
                    type="radio"
                    value="DIRECT"
                    {...form.register('publishType')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <span className="font-medium">Publicar Direto</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      O post será enviado automaticamente para o Instagram
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                  <input
                    type="radio"
                    value="REMINDER"
                    {...form.register('publishType')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <span className="font-medium">Lembrete (Publicação Manual)</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Receba uma notificação no N8N para publicar manualmente
                    </p>
                  </div>
                </label>
              </div>

              {/* Campo de Informações Extras (condicional) */}
              {publishType === 'REMINDER' && (
                <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                  <Label htmlFor="reminderExtraInfo" className="text-sm font-medium">
                    Informações Extras para o Lembrete
                  </Label>
                  <Textarea
                    id="reminderExtraInfo"
                    {...form.register('reminderExtraInfo')}
                    placeholder="Cole um link ou adicione instruções especiais para este post..."
                    rows={3}
                    className="mt-2 resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Exemplo: Link para adicionar no story, instruções de aprovação, etc.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Primeiro Comentário - Apenas para POST e CAROUSEL */}
          {(postType === 'POST' || postType === 'CAROUSEL') && (
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
              <p className="text-xs text-muted-foreground mt-1">
                💡 Ideal para adicionar hashtags extras ou CTAs sem poluir a legenda
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createPost.isPending || updatePost.isPending || selectedMedia.length === 0}
            >
              {(createPost.isPending || updatePost.isPending) ? 'Processando...' :
                postId ? 'Salvar Alterações' :
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
