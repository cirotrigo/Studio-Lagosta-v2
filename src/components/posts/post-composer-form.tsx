'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSocialPosts } from '@/hooks/use-social-posts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MediaUploadSystem } from './media-upload-system'
import { SchedulePicker } from './schedule-picker'
import { RecurringConfig } from './recurring-config'
import { PostLivePreview, FORMAT_LABELS } from './post-live-preview'
import { toast } from 'sonner'
import { PostType, ScheduleType, RecurrenceFrequency, PublishType } from '../../../prisma/generated/client'
import { Calendar, Repeat, Zap, Wand2, Loader2 } from 'lucide-react'
import { useImproveCaption } from '@/hooks/use-improve-caption'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { isVideoUrl } from '@/lib/media-type'

export type RecurringConfigValue = {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  time: string
  daysOfWeek?: number[]
  endDate?: Date
}

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

const RECURRENCE_FREQUENCIES: ReadonlyArray<RecurringConfigValue['frequency']> = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
]

/**
 * Converte o `recurringConfig` do banco (Json) no que o formulário espera.
 *
 * Vivia em quatro cópias — nas duas agendas, na rota de edição e no painel do
 * editor —, e a do painel era mais frouxa: inventava "DAILY 09:00" quando o
 * dado estava torto, em vez de admitir que não dava para ler. Esta é a
 * estrita: config inválida vira `undefined`, e o formulário simplesmente não
 * mostra recorrência nenhuma.
 */
export function parseRecurringConfig(config: unknown): RecurringConfigValue | undefined {
  if (!config || typeof config !== 'object') return undefined

  const raw = config as Record<string, unknown>
  const frequency = raw.frequency
  const time = raw.time

  if (
    typeof frequency !== 'string' ||
    !RECURRENCE_FREQUENCIES.includes(frequency as RecurringConfigValue['frequency']) ||
    typeof time !== 'string'
  ) {
    return undefined
  }

  const days = Array.isArray(raw.daysOfWeek)
    ? raw.daysOfWeek.filter((day): day is number => typeof day === 'number')
    : undefined
  const endDateValue = raw.endDate
  const endDate =
    typeof endDateValue === 'string' && endDateValue ? new Date(endDateValue) : undefined

  return {
    frequency: frequency as RecurringConfigValue['frequency'],
    time,
    ...(days && days.length > 0 ? { daysOfWeek: days } : {}),
    ...(endDate ? { endDate } : {}),
  }
}

interface MediaItem {
  id: string
  type: 'generation' | 'ai-image' | 'google-drive' | 'upload'
  url: string
  pathname?: string
  thumbnailUrl?: string
  name: string
  size?: number
  mimeType?: string
}

interface PostComposerFormProps {
  projectId: number
  postId?: string
  initialData?: Partial<PostFormData>
  /** Salvou (ou disparou o salvamento em segundo plano). */
  onDone: () => void
  /** Desistiu. */
  onCancel: () => void
}

const FORM_ID = 'post-composer-form'

const TIPOS: Array<{ value: PostFormData['postType']; icon: string }> = [
  { value: 'POST', icon: '📸' },
  { value: 'STORY', icon: '⭐' },
  { value: 'REEL', icon: '🎬' },
  { value: 'CAROUSEL', icon: '🎠' },
]

/**
 * O corpo do composer, sem casca — usado pela rota (tela cheia, com prévia
 * viva ao lado) e pelo `PostComposer`, que é o mesmo formulário dentro de um
 * Dialog para o painel de agenda do editor de templates.
 *
 * Toda a regra de validação veio intacta do modal original: legenda
 * obrigatória fora de story, carrossel de 2 a 10, reel só com vídeo, data no
 * futuro, recorrência com frequência e horário.
 *
 * Diferença de ciclo de vida: aqui a inicialização acontece na MONTAGEM, não
 * num `open` — quem monta decide quando existir. O Dialog passou a montar o
 * formulário só quando abre, o que dá no mesmo e dispensa os efeitos que
 * limpavam estado ao fechar.
 */
export function PostComposerForm({
  projectId,
  postId,
  initialData,
  onDone,
  onCancel,
}: PostComposerFormProps) {
  const { createPost, updatePost } = useSocialPosts(projectId)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([])
  const [hasInitializedMedia, setHasInitializedMedia] = useState(false)
  const isSubmittingRef = useRef(false)
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
  const mediaUrls = form.watch('mediaUrls')
  const scheduledDatetime = form.watch('scheduledDatetime')
  const recurringConfig = form.watch('recurringConfig')
  const publishType = form.watch('publishType')

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
    enabled: !!projectId,
  })

  // Track the latest selection in a ref so functional updates resolve against
  // the most recent value even when callers interleave (rapid clicks) or
  // complete out of order (async Drive/AI downloads).
  const selectedMediaStateRef = useRef(selectedMedia)
  const formRef = useRef(form)

  useEffect(() => {
    selectedMediaStateRef.current = selectedMedia
    formRef.current = form
  }, [selectedMedia, form])

  // Populate selectedMedia from initialData (edição)
  useEffect(() => {
    if (hasInitializedMedia || !initialData?.mediaUrls?.length) return

    const initialMedia: MediaItem[] = []

    // First, try to match with creatives if we have generationIds
    if (initialData.generationIds?.length && allCreatives) {
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

    // For any remaining mediaUrls that weren't matched (uploads, Drive, etc.)
    const unmatchedUrls = initialData.mediaUrls.filter(url =>
      !initialMedia.some(media => media.url === url)
    )

    unmatchedUrls.forEach((url, index) => {
      const isVideo = isVideoUrl(url)
      initialMedia.push({
        id: `existing-${index}-${url}`,
        type: 'upload' as const,
        url,
        thumbnailUrl: url,
        name: isVideo ? `Video ${index + 1}` : `Imagem ${index + 1}`,
        /*
          Marca o que JÁ ESTAVA no post: sem ela, o slide 2..N de um carrossel
          agendado herdava a regra do arquivo recém-subido (que já passou pelo
          enquadramento no uploader) e ficava sem o botão de enquadrar. O
          `type` continua 'upload' de propósito — ele governa outras quatro
          regras aqui e no sistema de mídia, e mexer nele mudaria comportamento
          que ninguém pediu.
        */
        preexistente: true,
      } as MediaItem)
    })

    if (initialMedia.length > 0) {
      setSelectedMedia(initialMedia)
      selectedMediaStateRef.current = initialMedia
      setHasInitializedMedia(true)
    }
  }, [hasInitializedMedia, initialData, allCreatives])

  const handleRecurringConfigChange = useCallback((config: RecurringConfigValue | undefined) => {
    formRef.current.setValue('recurringConfig', config)
  }, [])

  // Update form when media changes. Accepts a new array OR a functional updater;
  // the updater is resolved against the latest selection ref so concurrent
  // add/remove operations chain atomically and never clobber each other.
  const handleMediaChange = useCallback(
    (update: MediaItem[] | ((prev: MediaItem[]) => MediaItem[])) => {
      const next = typeof update === 'function' ? update(selectedMediaStateRef.current) : update
      selectedMediaStateRef.current = next
      setSelectedMedia(next)
      formRef.current.setValue('mediaUrls', next.map((m) => m.url))
      formRef.current.setValue(
        'generationIds',
        next.filter((m) => m.type === 'generation').map((m) => m.id),
      )
    },
    [],
  )

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
    if (isSubmittingRef.current) {
      console.warn('🚫 Prevented double-submit - already processing')
      return
    }

    try {
      isSubmittingRef.current = true

      if (postType !== 'STORY' && (!data.caption || data.caption.trim() === '')) {
        isSubmittingRef.current = false
        toast.error('Legenda é obrigatória')
        form.setError('caption', { type: 'manual', message: 'Legenda é obrigatória' })
        return
      }

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

      if (postType === 'REEL') {
        const hasVideo = selectedMedia.some((media) => isVideoUrl(media.url))
        if (!hasVideo) {
          isSubmittingRef.current = false
          toast.error('Reel deve conter um vídeo (.mp4, .mov, .avi, .webm)')
          return
        }
      }

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

      const blobPathnames = selectedMedia
        .filter(m => m.type === 'upload' || m.type === 'google-drive')
        .map(m => m.pathname)
        .filter(Boolean) as string[]

      const postData = {
        postType: data.postType as PostType,
        caption: data.postType === 'STORY' ? '' : (data.caption || ''), // Force empty for stories
        mediaUrls: data.mediaUrls,
        blobPathnames,
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

      // Sai da tela e processa em segundo plano — carrossel de 10 imagens
      // demora, e segurar a pessoa parada olhando não ajuda em nada.
      onDone()

      if (postId) {
        updatePost.mutate({ postId, data: postData }, {
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

      return
    } catch (error) {
      console.error('Error preparing post:', error)
      if (error instanceof Error) {
        toast.error(`❌ Erro: ${error.message}`)
      } else {
        toast.error('❌ Erro ao preparar post. Verifique os dados e tente novamente.')
      }
    } finally {
      isSubmittingRef.current = false
    }
  }

  /** "segunda, 11/08 às 16:00" — o que a prévia diz embaixo da legenda. */
  const quandoLabel =
    scheduleType === 'IMMEDIATE'
      ? 'Vai sair assim que você confirmar'
      : scheduleType === 'RECURRING'
        ? 'Série recorrente'
        : scheduledDatetime
          ? `Sai ${scheduledDatetime.toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
          })} às ${scheduledDatetime.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}`
          : 'Horário ainda não escolhido'

  const salvando = createPost.isPending || updatePost.isPending

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {/*
          Duas colunas no desktop: formulário à esquerda, prévia à direita, que
          é o que o app desktop faz. No celular a prévia vem PRIMEIRO, em
          tamanho reduzido — ver o resultado enquanto se escreve é metade da
          razão de ela existir, e no fim da página ninguém rolaria até lá.
        */}
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <form
            id={FORM_ID}
            onSubmit={form.handleSubmit(onSubmit)}
            className="order-2 space-y-6 lg:order-none"
          >
            {/* Tipo de Post — cada card declara a dimensão que o formato tem */}
            <div>
              <Label className="text-base font-semibold">Tipo de Post</Label>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIPOS.map((type) => {
                  const formato = FORMAT_LABELS[type.value]
                  return (
                    <Button
                      key={type.value}
                      type="button"
                      variant={postType === type.value ? 'default' : 'outline'}
                      onClick={() => {
                        form.setValue('postType', type.value)

                        // Reset media if switching to/from carousel
                        if ((type.value === 'CAROUSEL' && selectedMedia.length > 10) ||
                          (type.value !== 'CAROUSEL' && selectedMedia.length > 1)) {
                          handleMediaChange([])
                        }

                        // STORY e REEL não têm primeiro comentário
                        if (type.value === 'STORY' || type.value === 'REEL') {
                          form.setValue('firstComment', '')
                        }
                      }}
                      className="flex h-auto flex-col items-center gap-0.5 py-2.5"
                    >
                      <span className="text-xl">{type.icon}</span>
                      <span className="text-xs font-medium">{formato.nome}</span>
                      <span className="text-[10px] font-normal opacity-70">
                        {formato.medida}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Seletor de Mídia */}
            <div>
              <Label className="text-base font-semibold">
                Mídia
                <span className="ml-1 text-red-500">*</span>
              </Label>
              <p className="mb-3 text-sm text-muted-foreground">
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
                  {postType !== 'STORY' && <span className="ml-1 text-red-500">*</span>}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleImproveCaption}
                  disabled={improveCaption.isPending || !caption?.trim()}
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {improveCaption.isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Melhorando...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3 w-3" />
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
              <div className="mt-1 flex justify-between">
                <p className="text-xs text-muted-foreground">
                  {postType === 'STORY'
                    ? '💡 Texto opcional. Stories são temporários e duram 24 horas'
                    : postType === 'REEL'
                      ? '💡 Use hashtags e mencione perfis para aumentar o alcance'
                      : '💡 Máximo de 2.200 caracteres. Use hashtags relevantes'}
                </p>
                <p className="text-xs font-medium">{caption?.length || 0}/2200</p>
              </div>
            </div>

            {/* Tipo de Agendamento */}
            <div>
              <Label className="text-base font-semibold">Quando postar?</Label>
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <input type="radio" value="IMMEDIATE" {...form.register('scheduleType')} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      <span className="font-medium">Postar Agora</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      O post será enviado imediatamente
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <input type="radio" value="SCHEDULED" {...form.register('scheduleType')} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span className="font-medium">Agendar para Data/Hora</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Escolha quando o post será publicado
                    </p>
                  </div>
                </label>

                {scheduleType === 'SCHEDULED' && (
                  <div className="ml-9 border-l-2 pl-3">
                    <SchedulePicker
                      value={form.watch('scheduledDatetime')}
                      onChange={(date) => form.setValue('scheduledDatetime', date)}
                    />
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <input type="radio" value="RECURRING" {...form.register('scheduleType')} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-4 w-4" />
                      <span className="font-medium">Postagem Recorrente</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Configure posts automáticos periódicos
                    </p>
                  </div>
                </label>

                {scheduleType === 'RECURRING' && (
                  <div className="ml-9 border-l-2 pl-3">
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
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <input type="radio" value="DIRECT" {...form.register('publishType')} className="mt-1" />
                    <div className="flex-1">
                      <span className="font-medium">Publicar Direto</span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        O post será enviado automaticamente para o Instagram
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <input type="radio" value="REMINDER" {...form.register('publishType')} className="mt-1" />
                    <div className="flex-1">
                      <span className="font-medium">Lembrete (Publicação Manual)</span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        A equipe recebe a arte e a legenda no WhatsApp para publicar na mão
                      </p>
                    </div>
                  </label>
                </div>

                {publishType === 'REMINDER' && (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3">
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
                    <p className="mt-2 text-xs text-muted-foreground">
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
                <p className="mt-1 text-xs text-muted-foreground">
                  💡 Ideal para adicionar hashtags extras ou CTAs sem poluir a legenda
                </p>
              </div>
            )}
          </form>

          <aside className="order-1 lg:order-none lg:sticky lg:top-0">
            <PostLivePreview
              projectId={projectId}
              postType={postType as PostType}
              mediaUrls={mediaUrls ?? []}
              caption={caption ?? ''}
              quando={quandoLabel}
            />
          </aside>
        </div>
      </div>

      {/* Ações sempre à vista, como na tela do post */}
      <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            className="min-w-[9rem] flex-1 sm:flex-none"
            disabled={salvando || selectedMedia.length === 0}
          >
            {salvando ? 'Processando...' :
              postId ? 'Salvar Alterações' :
                scheduleType === 'IMMEDIATE' ? 'Postar Agora' :
                  scheduleType === 'SCHEDULED' ? 'Agendar Post' :
                    'Criar Série Recorrente'}
          </Button>
        </div>
      </div>
    </div>
  )
}
