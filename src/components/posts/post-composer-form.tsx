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
import { QuandoBar } from './quando-bar'
import { RecurringConfig } from './recurring-config'
import { PostLivePreview, FORMAT_LABELS } from './post-live-preview'
import { toast } from 'sonner'
import { PostType, ScheduleType, RecurrenceFrequency, PublishType } from '../../../prisma/generated/client'
import { ChevronDown, Wand2, Loader2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useHorariosTipicos } from '@/hooks/use-horarios-tipicos'
import { proximoHorario, rotuloCurto, rotuloDoBotao, rotuloLongo } from '@/lib/posts/quando'
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
  /**
   * Dia vindo do "+" da agenda, SEM hora: a primeira hora típica do cliente
   * naquele dia da semana preenche. (Até 05/09/2026 o "+" cravava 10:00.)
   */
  diaSugerido?: Date
  /** Salvou (ou disparou o salvamento em segundo plano). */
  onDone: () => void
  /** Desistiu. */
  onCancel: () => void
}

const FORM_ID = 'post-composer-form'

const TIPOS: Array<{ value: PostFormData['postType']; icon: string }> = [
  { value: 'STORY', icon: '⭐' },
  { value: 'POST', icon: '📸' },
  { value: 'CAROUSEL', icon: '🎠' },
  { value: 'REEL', icon: '🎬' },
]

/**
 * O corpo do composer, sem casca — usado pela rota (tela cheia, com prévia
 * viva ao lado) e pelo `PostComposer`, que é o mesmo formulário dentro de um
 * Dialog para os painéis do editor e as galerias.
 *
 * A ordem (05/09/2026): QUANDO → MÍDIA → LEGENDA (só feed) → "Mais opções".
 * Medido nos 2.684 posts dos 90 dias anteriores: 92% são story, 27% saem na
 * hora, recorrente 0, primeiro comentário 0 de 216 posts de feed, lembrete
 * 1%, e 40% nascem a menos de 2h do horário. O formulário pedia tudo isso de
 * frente, com a data no quarto bloco. Para story, agora cabe numa tela:
 * quando → mídia → agendar. O resto continua existindo atrás de "Mais
 * opções", com a mesma regra de negócio.
 *
 * Toda a regra de validação veio intacta: legenda obrigatória fora de story,
 * carrossel de 2 a 10, reel só com vídeo, data no futuro, recorrência com
 * frequência e horário.
 *
 * 🔴 Para STORY a legenda SOME em vez de ser "opcional": o envio grava
 * `caption: ''` para story desde sempre (linha do `postData`), e um campo que
 * convida a digitar o que vai ser descartado é pior que campo ausente.
 */
export function PostComposerForm({
  projectId,
  postId,
  initialData,
  diaSugerido,
  onDone,
  onCancel,
}: PostComposerFormProps) {
  const { createPost, updatePost } = useSocialPosts(projectId)
  const { data: horarios, isLoading: horariosCarregando } = useHorariosTipicos(projectId)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([])
  const [hasInitializedMedia, setHasInitializedMedia] = useState(false)
  const isSubmittingRef = useRef(false)
  const improveCaption = useImproveCaption()
  const editando = Boolean(postId)

  /*
    Quem chega da galeria ou do editor JÁ escolheu a arte: as fontes de mídia
    começam recolhidas e o bloco mostra só o que foi escolhido, com "Trocar".
    É exatamente o caso "o usuário normalmente já chega com o criativo
    selecionado" — o Quando fica sozinho no topo.
  */
  const [fontesRecolhidas, setFontesRecolhidas] = useState(
    () => !postId && (initialData?.mediaUrls?.length ?? 0) > 0,
  )
  // "Mais opções" já abre quando o post editado usa algo que mora lá.
  const [maisOpcoes, setMaisOpcoes] = useState(
    () =>
      initialData?.publishType === 'REMINDER' ||
      initialData?.scheduleType === 'RECURRING' ||
      Boolean(initialData?.firstComment?.trim()),
  )

  const form = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      // STORY é 92% do que a equipe cria; o padrão antigo (POST) obrigava um
      // clique a mais em nove de cada dez posts.
      postType: 'STORY',
      caption: '',
      mediaUrls: [],
      generationIds: [],
      // SCHEDULED é 73%; "Agora" é um chip no bloco Quando.
      scheduleType: 'SCHEDULED',
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

  // Estável de propósito: é dependência do efeito que aplica o padrão no QuandoBar.
  const handleQuandoChange = useCallback(
    (next: { scheduleType: PostFormData['scheduleType']; scheduledDatetime?: Date }) => {
      formRef.current.setValue('scheduleType', next.scheduleType)
      formRef.current.setValue('scheduledDatetime', next.scheduledDatetime)
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
      { caption: currentCaption, projectId, postType: currentPostType },
      {
        onSuccess: (data) => {
          formRef.current.setValue('caption', data.improvedCaption)
          toast.success('Legenda melhorada!')
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Erro ao melhorar legenda'
          toast.error(message)
        },
      },
    )
  }, [improveCaption, projectId])

  /*
    "Agendar e próximo" (F3): o botão secundário arma este ref ANTES do submit
    (os dois botões são `type="submit"` do mesmo form; o onClick roda antes).
    A cadência aprovada é 3 stories/dia, e cada um era um ciclo inteiro de
    abrir-preencher-fechar.
  */
  const eProximoRef = useRef(false)

  const onSubmit = async (data: PostFormData) => {
    if (isSubmittingRef.current) {
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

      const eProximo = eProximoRef.current && !postId && data.scheduleType === 'SCHEDULED' && data.scheduledDatetime
      eProximoRef.current = false

      // Sai da tela e processa em segundo plano — carrossel de 10 imagens
      // demora, e segurar a pessoa parada olhando não ajuda em nada.
      // (No "e próximo" a tela FICA, limpa, já no horário seguinte.)
      if (!eProximo) onDone()

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
          toast.success(`📅 Agendando para ${rotuloCurto(data.scheduledDatetime!)}...`)
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

        if (eProximo) {
          const prox = proximoHorario(horarios?.porDia, data.scheduledDatetime!)
          handleMediaChange([])
          form.setValue('caption', '')
          form.setValue('firstComment', '')
          form.setValue('scheduledDatetime', prox)
          setFontesRecolhidas(false)
          toast.success(`Próximo: ${rotuloCurto(prox)}. Escolha a mídia.`)
        }
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
          ? `Sai ${rotuloLongo(scheduledDatetime)}`
          : 'Horário ainda não escolhido'

  const salvando = createPost.isPending || updatePost.isPending
  const podeProximo = !postId && scheduleType === 'SCHEDULED' && Boolean(scheduledDatetime)

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
            {/* QUANDO — primeiro bloco — com o tipo de post ao lado, pequeno */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-base font-semibold">Quando</Label>
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="radiogroup" aria-label="Tipo de post">
                  {TIPOS.map((type) => {
                    const ativo = postType === type.value
                    return (
                      <button
                        key={type.value}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        title={`${FORMAT_LABELS[type.value].nome} · ${FORMAT_LABELS[type.value].medida}`}
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
                        className={
                          ativo
                            ? 'rounded-md bg-background px-2.5 py-1 text-xs font-medium shadow-sm'
                            : 'rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'
                        }
                      >
                        <span className="mr-1">{type.icon}</span>
                        {FORMAT_LABELS[type.value].nome}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mt-3">
                <QuandoBar
                  scheduleType={scheduleType}
                  scheduledDatetime={scheduledDatetime}
                  onChange={handleQuandoChange}
                  horariosPorDia={horarios?.porDia}
                  horariosCarregando={horariosCarregando}
                  diaSugerido={diaSugerido}
                  editando={editando}
                />
              </div>
            </div>

            {/* MÍDIA */}
            <div>
              <Label className="text-base font-semibold">
                Mídia
                <span className="ml-1 text-red-500">*</span>
              </Label>
              {!fontesRecolhidas && (
                <p className="mb-3 text-sm text-muted-foreground">
                  {postType === 'CAROUSEL'
                    ? '📸 Selecione de 2 a 10 imagens para o carrossel (apenas imagens)'
                    : postType === 'REEL'
                      ? '🎬 Selecione 1 vídeo para o reel (.mp4, .mov, .avi ou .webm)'
                      : postType === 'STORY'
                        ? '⭐ Selecione 1 imagem ou vídeo para o story (24h de duração)'
                        : '📷 Selecione 1 imagem para o post'}
                </p>
              )}
              <MediaUploadSystem
                projectId={projectId}
                selectedMedia={selectedMedia}
                onSelectionChange={handleMediaChange}
                maxSelection={maxMedia}
                postType={postType}
                quando={scheduleType === 'SCHEDULED' ? scheduledDatetime : undefined}
                postIdEmEdicao={postId}
                fontesRecolhidas={fontesRecolhidas}
                onExpandirFontes={() => setFontesRecolhidas(false)}
              />
            </div>

            {/* LEGENDA — só feed: para story o envio grava vazio, então o campo não existe */}
            {postType !== 'STORY' && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="caption" className="text-base font-semibold">
                    Legenda
                    <span className="ml-1 text-red-500">*</span>
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
                  placeholder="Escreva sua legenda..."
                  rows={5}
                  maxLength={2200}
                  className="mt-2 resize-none"
                />
                <div className="mt-1 flex justify-between">
                  <p className="text-xs text-muted-foreground">
                    {postType === 'REEL'
                      ? '💡 Use hashtags e mencione perfis para aumentar o alcance'
                      : '💡 Máximo de 2.200 caracteres. Use hashtags relevantes'}
                  </p>
                  <p className="text-xs font-medium">{caption?.length || 0}/2200</p>
                </div>
              </div>
            )}

            {/* MAIS OPÇÕES — o que 99% dos posts não usa, sem sumir */}
            <Collapsible open={maisOpcoes} onOpenChange={setMaisOpcoes}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${maisOpcoes ? 'rotate-180' : ''}`} />
                  <span className="font-medium">Mais opções</span>
                  <span className="hidden text-xs sm:inline">— lembrete no WhatsApp, repetição{postType === 'POST' || postType === 'CAROUSEL' ? ', primeiro comentário' : ''}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6 pt-4">
                {/* Repetição */}
                {!postId && (
                  <div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={scheduleType === 'RECURRING'}
                        onChange={(e) =>
                          handleQuandoChange({
                            scheduleType: e.target.checked ? 'RECURRING' : 'SCHEDULED',
                            scheduledDatetime,
                          })
                        }
                      />
                      <div className="flex-1">
                        <span className="font-medium">Repetir (série recorrente)</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          O mesmo post em vários dias, com dias da semana e horário fixos
                        </p>
                      </div>
                    </label>
                    {scheduleType === 'RECURRING' && (
                      <div className="ml-9 mt-3 border-l-2 pl-3">
                        <RecurringConfig
                          value={recurringConfig as RecurringConfigValue | undefined}
                          onChange={handleRecurringConfigChange}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tipo de Publicação - Apenas para posts agendados */}
                {scheduleType !== 'IMMEDIATE' && (
                  <div>
                    <Label className="text-base font-semibold">Como publicar</Label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                        <input type="radio" value="DIRECT" {...form.register('publishType')} className="mt-1" />
                        <div className="flex-1">
                          <span className="font-medium">Publicar direto</span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            O post será enviado automaticamente para o Instagram
                          </p>
                        </div>
                      </label>

                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                        <input type="radio" value="REMINDER" {...form.register('publishType')} className="mt-1" />
                        <div className="flex-1">
                          <span className="font-medium">Lembrete (publicação manual)</span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            A equipe recebe a arte e a legenda no WhatsApp para publicar na mão
                          </p>
                        </div>
                      </label>
                    </div>

                    {publishType === 'REMINDER' && (
                      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                        <Label htmlFor="reminderExtraInfo" className="text-sm font-medium">
                          Informações extras para o lembrete
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
                      Primeiro comentário (opcional)
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
              </CollapsibleContent>
            </Collapsible>
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
          {podeProximo && (
            <Button
              type="submit"
              form={FORM_ID}
              variant="secondary"
              title="Agenda este e já abre o próximo horário do dia"
              disabled={salvando || selectedMedia.length === 0}
              onClick={() => {
                eProximoRef.current = true
              }}
            >
              Agendar e próximo
            </Button>
          )}
          <Button
            type="submit"
            form={FORM_ID}
            className="min-w-[9rem] flex-1 sm:flex-none"
            disabled={salvando || selectedMedia.length === 0}
            onClick={() => {
              eProximoRef.current = false
            }}
          >
            {salvando ? 'Processando...' : rotuloDoBotao(scheduleType, scheduledDatetime, Boolean(postId))}
          </Button>
        </div>
      </div>
    </div>
  )
}
