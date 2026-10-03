"use client"

import * as React from 'react'
import Image from 'next/image'
import { Download, Loader2, Film, AlertCircle, Music, CheckCircle2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useAuth } from '@clerk/nextjs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useCredits } from '@/hooks/use-credits'
import {
  exportVideoWithLayers,
  checkVideoExportSupport,
  type VideoExportProgress,
} from '@/lib/konva/konva-video-export'
import { AudioSelectionModal, type AudioConfig } from '@/components/audio/audio-selection-modal'
import { upload } from '@vercel/blob/client'
import { createId } from '@/lib/id'
import { duracaoDaPagina, paginaEVideo, videoPrincipal } from '@/lib/video/camadas-de-video'
import { trechosDeVideo } from '@/lib/video/plano-de-som'
import { useMultiPageOpcional } from '@/contexts/multi-page-context'
import { relogioDaPagina } from '@/lib/video/relogio-da-pagina'
import { api } from '@/lib/api-client'
import { usePageSync } from './page-sync-wrapper'
import { useAgendaDasPaginas } from '@/hooks/use-agenda-das-paginas'
import { useHorariosTipicos } from '@/hooks/use-horarios-tipicos'
import { rotuloCurto } from '@/lib/posts/quando'
import {
  antecedenciaParaGravar,
  motivoDaRecusa,
  quandoInicialDoVideo,
  tiposPermitidos,
  type DestinoDoVideo,
  type ResultadoDoDestino,
} from '@/lib/video/destino-do-video'

const sanitizeFileName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'video'

const generateUploadPath = (clerkUserId: string, videoName: string) => {
  const randomSuffix = createId()
  return `video-processing/${clerkUserId}/${Date.now()}-${randomSuffix}-${sanitizeFileName(videoName)}.webm`
}

const generateThumbnailUploadPath = (clerkUserId: string, videoName: string) => {
  const randomSuffix = createId()
  return `video-thumbnails/${clerkUserId}/${Date.now()}-${randomSuffix}-${sanitizeFileName(videoName)}.jpg`
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return await response.blob()
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
/** O valor do `<input type="datetime-local">`: horário LOCAL de quem clica. */
const paraCampo = (d: Date) =>
  `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`

type EscolhaDeDestino = 'agenda' | 'galeria' | 'substituir'

interface StatusDoJob {
  status: string
  progress?: number | null
  generationId?: string | null
  mp4ResultUrl?: string | null
  thumbnailUrl?: string | null
  errorMessage?: string | null
  destino?: { tipo: string; postId: string | null; aviso: string | null; resultado: ResultadoDoDestino | null } | null
}

interface GerarVideo {
  /**
   * Abre o diálogo de gerar vídeo. Com `pageId` de outra página, troca para
   * ela antes (a gravação é sempre da página aberta); `destino` é o que vem
   * marcado (a faixa da página pede agenda ou substituição).
   */
  abrir: (opcoes?: { pageId?: string; destino?: EscolhaDeDestino }) => void
  /** Sem crédito ou navegador que não grava: o botão aparece desabilitado. */
  indisponivel: boolean
}

const GerarVideoContext = React.createContext<GerarVideo | null>(null)

/**
 * O contexto ÚNICO de gerar vídeo do editor: os botões do cabeçalho, da tela
 * cheia, do menu do celular, do "Agendar" do modo clássico e da faixa da
 * página abrem o MESMO diálogo, com o mesmo destino. `null` fora do editor.
 */
export function useGerarVideo(): GerarVideo | null {
  return React.useContext(GerarVideoContext)
}

/** O botão de sempre — só abre o diálogo do contexto. */
export function VideoExportButton({ aoAbrir }: { aoAbrir?: () => void } = {}) {
  const gerar = useGerarVideo()
  const { design } = useTemplateEditor()
  if (!gerar || !paginaEVideo(design.layers, design.audio)) return null
  return (
    <Button
      onClick={() => {
        aoAbrir?.()
        gerar.abrir()
      }}
      variant="default"
      size="sm"
      className="gap-2"
      disabled={gerar.indisponivel}
    >
      <Film className="h-4 w-4" />
      Exportar Vídeo
    </Button>
  )
}

export function GerarVideoProvider({
  postIdDaAgenda,
  aoEnfileirar,
  children,
}: {
  /** O editor veio da agenda a partir deste post: o destino já é substituir o vídeo dele. */
  postIdDaAgenda?: string
  /** Chamado quando a fila respondeu com o job (o editor vindo da agenda volta para lá). */
  aoEnfileirar?: (destino: DestinoDoVideo) => void
  children: React.ReactNode
}) {
  const editorContext = useTemplateEditor()
  const { design, zoom, templateId, projectId, getStageInstance } = editorContext
  const designName =
    typeof (design as { name?: string }).name === 'string' ? (design as { name?: string }).name! : 'Sem título'
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { userId: clerkUserId } = useAuth()
  const { canPerformOperation, getCost, credits } = useCredits()
  const pageSync = usePageSync()

  // O vídeo de fundo dita duração e som; na página que só tem motion (motion
  // sobre foto) o próprio motion dita a duração e não há som original. Sem
  // vídeo nenhum, a MÚSICA faz a página virar vídeo: o stage parado é gravado
  // pela fatia dela. Numa sequência, o som original é o de cada clipe de
  // vídeo (Fase 4) — `trechosDeVideo` é a mesma pergunta que a fila faz.
  const videoLayer = videoPrincipal(design.layers)
  const paginaVideo = paginaEVideo(design.layers, design.audio)
  const semSomOriginal = trechosDeVideo(design.layers).length === 0
  const multiPage = useMultiPageOpcional()
  const currentPageId = multiPage?.currentPageId ?? null
  // A gravação é sobre UM design parado: editar, desfazer ou trocar de página
  // no meio cancela com motivo (lidos por ref, no laço do export)
  const designRef = React.useRef(design)
  designRef.current = design
  const currentPageIdRef = React.useRef(currentPageId)
  currentPageIdRef.current = currentPageId

  const [isOpen, setIsOpen] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [exportProgress, setExportProgress] = React.useState<VideoExportProgress | null>(null)
  // Depois que a fila responde com o job: o que vai acontecer com o vídeo
  const [naFila, setNaFila] = React.useState<string | null>(null)

  // Estados para configuração de áudio
  const [isAudioModalOpen, setIsAudioModalOpen] = React.useState(false)
  const DEFAULT_AUDIO_CONFIG = React.useMemo<AudioConfig>(
    () => ({
      source: 'original',
      startTime: 0,
      endTime: 10, // Será atualizado quando a duração real for detectada
      volume: 80,
      fadeIn: false,
      fadeOut: false,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
    }),
    [],
  )
  // A trilha persistida na página (aba Músicas / Page.audio) é o ponto de
  // partida; sem trilha salva, cai no default (áudio original do vídeo).
  const [audioConfig, setAudioConfig] = React.useState<AudioConfig>(
    () => design.audio ?? DEFAULT_AUDIO_CONFIG,
  )
  const hasPersistedAudioRef = React.useRef(Boolean(design.audio))

  React.useEffect(() => {
    hasPersistedAudioRef.current = Boolean(design.audio)
    setAudioConfig(design.audio ?? DEFAULT_AUDIO_CONFIG)
  }, [design.audio, DEFAULT_AUDIO_CONFIG])

  // Refs para acessar selectedLayerIds e setZoom dentro da função de exportação
  const selectedLayerIdsRef = React.useRef<string[]>(editorContext.selectedLayerIds)
  const setZoomState = editorContext.setZoom
  const selectLayersFn = editorContext.selectLayers

  // Manter ref atualizada
  React.useEffect(() => {
    selectedLayerIdsRef.current = editorContext.selectedLayerIds
  }, [editorContext.selectedLayerIds])

  // A duração é a da PÁGINA como vídeo (a mesma conta do export): o trecho do
  // vídeo principal limitado pela música, ou só a fatia da música. A do vídeo
  // vem da própria camada (o VideoNode grava videoMetadata.duration).
  const videoDuration = duracaoDaPagina(design.layers, design.audio)
  React.useEffect(() => {
    // Trilha salva na página tem trecho escolhido pela pessoa: não sobrescrever
    if (videoDuration === null || hasPersistedAudioRef.current) return
    setAudioConfig((prev) => (prev.endTime === videoDuration ? prev : { ...prev, endTime: videoDuration }))
  }, [videoDuration, design.audio])

  const creditCost = getCost('video_export')
  const hasCredits = canPerformOperation('video_export')
  const hasSelectedMusic =
    (audioConfig.source === 'library' || audioConfig.source === 'mix') && !!audioConfig.musicId
  // Fatia de música mais curta que 1 s não dá vídeo (sem vídeo ela É a duração)
  const fatiaCurta = !videoLayer && hasSelectedMusic && (videoDuration ?? 0) < 1

  // Verificar suporte do navegador
  const browserSupport = React.useMemo(() => checkVideoExportSupport(), [])

  // ── Destino: "Depois de gerar" ──────────────────────────────────────────
  const { data: agendaDaPasta } = useAgendaDasPaginas(templateId)
  const { data: horarios } = useHorariosTipicos(projectId)
  const agendaDaPagina = agendaDaPasta?.paginas.find((p) => p.pageId === currentPageId)
  // Só o post de VÍDEO ainda trocável desta página pode ter o vídeo substituído
  const postDaPagina =
    agendaDaPagina?.post && agendaDaPagina.post.comVideo && agendaDaPagina.post.substituivel
      ? agendaDaPagina.post
      : null
  const postSubstituivelId = postDaPagina?.id ?? null
  const tipos = tiposPermitidos(design.canvas.width, design.canvas.height)
  const tipoPadrao = tipos[0]
  const antecedencia = antecedenciaParaGravar(videoDuration)

  const [escolha, setEscolha] = React.useState<EscolhaDeDestino>('agenda')
  const [quandoCampo, setQuandoCampo] = React.useState('')
  const [postType, setPostType] = React.useState<'STORY' | 'REEL'>('STORY')
  const [legenda, setLegenda] = React.useState('')
  const [situacao, setSituacao] = React.useState<'agendado' | 'rascunho'>('agendado')
  const [pedido, setPedido] = React.useState<EscolhaDeDestino | null>(null)
  // Mexeu no formulário: a chegada atrasada da agenda ou dos horários não o desfaz
  const [tocado, setTocado] = React.useState(false)

  React.useEffect(() => {
    if (!isOpen || tocado) return
    const doPost =
      postSubstituivelId !== null && (pedido === 'substituir' || (!pedido && postIdDaAgenda === postSubstituivelId))
    setEscolha(!currentPageId ? 'galeria' : doPost ? 'substituir' : pedido === 'galeria' ? 'galeria' : 'agenda')
    setQuandoCampo(paraCampo(quandoInicialDoVideo(agendaDaPagina?.quando, horarios?.porDia, new Date(), antecedencia)))
    setPostType(tipoPadrao)
  }, [isOpen, tocado, pedido, postIdDaAgenda, postSubstituivelId, currentPageId, agendaDaPagina?.quando, horarios, antecedencia, tipoPadrao])

  const mexer = <T,>(setter: (v: T) => void) => (v: T) => {
    setTocado(true)
    setter(v)
  }

  const problemaDoDestino = (): string | null => {
    if (escolha === 'galeria') return null
    if (!currentPageId) return 'Abra a página do vídeo para levá-lo à agenda.'
    if (escolha === 'substituir') {
      return postDaPagina ? null : 'O post desta página não pode mais ter o vídeo trocado (já foi publicado ou entregue).'
    }
    const quando = new Date(quandoCampo)
    if (!quandoCampo || Number.isNaN(quando.getTime())) return 'Escolha a data e a hora do post.'
    if (quando.getTime() - Date.now() < antecedencia) {
      return `Escolha um horário a partir de ${rotuloCurto(new Date(Date.now() + antecedencia))}: o vídeo ainda precisa ser gravado e preparado.`
    }
    if (!tipos.includes(postType)) return 'Story precisa de página vertical (9:16). Esta página só pode ir como Reel.'
    return null
  }
  const problema = isOpen ? problemaDoDestino() : null

  const abrir = React.useCallback<GerarVideo['abrir']>(
    (opcoes) => {
      if (opcoes?.pageId && opcoes.pageId !== currentPageIdRef.current) multiPage?.setCurrentPageId(opcoes.pageId)
      setPedido(opcoes?.destino ?? null)
      setTocado(false)
      setNaFila(null)
      setIsOpen(true)
    },
    [multiPage],
  )

  const fechar = (open: boolean) => {
    // Gravando, o diálogo não fecha: o canvas voltaria a aceitar clique e a
    // seleção entraria no vídeo.
    if (open || isExporting) return
    setIsOpen(false)
    setNaFila(null)
    setPedido(null)
    setTocado(false)
  }

  const pollJobStatus = React.useCallback(
    (jobId: string, initialGenerationId?: string, projectIdParam?: number, pageId?: string | null) => {
      let pollCount = 0
      const maxPolls = 60
      let linkedGenerationId = initialGenerationId

      const interval = setInterval(async () => {
        pollCount++
        if (pollCount > maxPolls) {
          clearInterval(interval)
          toast({
            variant: 'destructive',
            title: 'Processamento em andamento',
            description: 'O MP4 continua em processamento. Verifique a aba Criativos em instantes.',
          })
          return
        }

        try {
          const job = await api.get<StatusDoJob>(`/api/video-processing/status/${jobId}`)
          const currentGenerationId: string | undefined =
            (typeof job?.generationId === 'string' ? job.generationId : undefined) ?? linkedGenerationId
          linkedGenerationId = currentGenerationId

          const resolvedProgress =
            typeof job.progress === 'number'
              ? job.progress
              : job.status === 'COMPLETED' || job.status === 'FAILED'
                ? 100
                : 0

          const detail = {
            jobId,
            generationId: currentGenerationId ?? null,
            projectId: projectIdParam,
            progress: resolvedProgress,
            status: job.status,
            mp4ResultUrl: job.mp4ResultUrl,
            thumbnailUrl: job.thumbnailUrl,
            pageId,
          }

          window.dispatchEvent(new CustomEvent('video-export-progress', { detail }))

          if (job.status === 'COMPLETED') {
            clearInterval(interval)
            // O destino já foi decidido pelo servidor: dizer o que aconteceu
            const d = job.destino
            const resultado = d?.resultado ?? null
            if (d?.tipo === 'substituir') {
              toast(
                resultado?.ok
                  ? { title: 'Vídeo da agenda substituído', description: 'O post já mostra o vídeo novo.' }
                  : {
                      variant: 'destructive',
                      title: 'O vídeo ficou pronto, mas não substituiu o da agenda',
                      description: `${motivoDaRecusa(resultado) ?? 'Sem resposta da troca.'} O vídeo novo está na aba Criativos.`,
                    },
              )
            } else if (d?.tipo === 'agenda') {
              toast(
                d.postId
                  ? { title: 'Vídeo pronto e na agenda', description: d.aviso ?? 'O post já está na agenda.' }
                  : {
                      variant: 'destructive',
                      title: 'O vídeo ficou pronto, mas não entrou na agenda',
                      description: `${motivoDaRecusa(resultado) ?? ''} Ele está na aba Criativos.`.trim(),
                    },
              )
            } else {
              toast({ title: 'Vídeo pronto', description: 'O MP4 está na aba Criativos.', duration: 8000 })
            }
            queryClient.invalidateQueries({ queryKey: ['agenda-das-paginas'] })
            queryClient.invalidateQueries({ queryKey: ['posts'] })
            queryClient.invalidateQueries({ queryKey: ['social-post'] })
            window.dispatchEvent(new CustomEvent('video-export-completed', { detail }))
          } else if (job.status === 'FAILED') {
            clearInterval(interval)
            toast({
              variant: 'destructive',
              title: 'Erro no processamento',
              description: job.errorMessage || 'Falha ao converter o vídeo.',
            })
            window.dispatchEvent(
              new CustomEvent('video-export-failed', { detail: { ...detail, errorMessage: job.errorMessage } }),
            )
          }
        } catch (error) {
          console.error('[VideoExportQueue] Polling error:', error)
          clearInterval(interval)
        }
      }, 5000)

      return () => clearInterval(interval)
    },
    [toast, queryClient],
  )

  const handleExport = async () => {
    if (!paginaVideo) {
      toast({
        variant: 'destructive',
        description: 'Esta página não tem vídeo nem música — não há o que exportar como vídeo.',
      })
      return
    }
    if (fatiaCurta) {
      toast({
        variant: 'destructive',
        description: 'O trecho da música é curto demais: escolha pelo menos 1 segundo na aba Músicas.',
      })
      return
    }

    if (!hasCredits) {
      toast({
        variant: 'destructive',
        description: `Créditos insuficientes. Necessário: ${creditCost} créditos`,
      })
      return
    }

    if (!browserSupport.supported) {
      toast({
        variant: 'destructive',
        title: 'Navegador não suportado',
        description: browserSupport.message,
      })
      return
    }

    const motivo = problemaDoDestino()
    if (motivo) {
      toast({ variant: 'destructive', description: motivo })
      return
    }

    // Com o workspace contínuo existem N stages montados (um por página), e
    // `document.querySelector` devolvia sempre o PRIMEIRO do DOM — a página 1.
    // `getStageInstance()` é a fonte da verdade do stage ATIVO.
    const stage = getStageInstance()

    if (!stage) {
      toast({
        variant: 'destructive',
        description: 'Canvas não disponível. Tente novamente.',
      })
      return
    }

    if (!clerkUserId) {
      toast({
        variant: 'destructive',
        description: 'Sessão expirada. Faça login novamente para continuar.',
      })
      return
    }

    const resolvedProjectId =
      typeof projectId === 'number'
        ? projectId
        : Number(projectId) && !Number.isNaN(Number(projectId))
          ? Number(projectId)
          : undefined

    if (!resolvedProjectId) {
      toast({
        variant: 'destructive',
        description: 'Projeto inválido para exportação.',
      })
      return
    }

    // Linha do tempo: a fila recusa acima de 180 s; story longo demais avisa
    if ((videoDuration ?? 0) > 180) {
      toast({ variant: 'destructive', description: 'O vídeo passa de 3 minutos. Encurte a linha do tempo e exporte de novo.' })
      return
    }
    const tetoDoFormato = design.canvas.height > design.canvas.width ? 60 : 90
    if ((videoDuration ?? 0) > tetoDoFormato) {
      toast({ description: `O vídeo tem ${Math.round(videoDuration ?? 0)} s — o Instagram corta story em 60 s e reel fica melhor até 90 s.` })
    }

    // O destino é decidido ANTES de gravar: quem cria o post (ou troca o
    // vídeo dele) é o servidor, quando o MP4 fica pronto.
    const destino: DestinoDoVideo =
      escolha === 'galeria'
        ? { tipo: 'galeria' }
        : escolha === 'substituir'
          ? { tipo: 'substituir', postId: postDaPagina!.id }
          : {
              tipo: 'agenda',
              quando: new Date(quandoCampo).toISOString(),
              postType,
              ...(postType === 'REEL' && legenda.trim() ? { legenda: legenda.trim() } : {}),
              situacao,
            }
    const destinoTexto =
      destino.tipo === 'galeria'
        ? 'Quando o MP4 ficar pronto, ele aparece na aba Criativos.'
        : destino.tipo === 'substituir'
          ? `Quando o MP4 ficar pronto, ele substitui o vídeo do post${
              postDaPagina?.quando ? ` de ${rotuloCurto(new Date(postDaPagina.quando))}` : ''
            }.`
          : `Quando o MP4 ficar pronto, ele entra na agenda ${
              destino.situacao === 'rascunho' ? 'como rascunho' : 'agendado'
            } para ${rotuloCurto(new Date(destino.quando))}.`

    // A página no banco é a que a fila compara com o vídeo gravado: o autosave
    // pendente iria depois e o vídeo nasceria "desatualizado".
    try {
      await pageSync?.descarregar()
    } catch (error) {
      console.error('[Video Export] Falha ao salvar a página antes de gravar:', error)
      toast({ variant: 'destructive', description: 'Não deu para salvar a página antes de gravar. Tente de novo.' })
      return
    }

    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 10 })

    // O MESMO objeto vai para a gravação e para a fila (`designData`)
    const designGravado = design
    const paginaGravada = currentPageId
    const cancelado = () => {
      if (currentPageIdRef.current !== paginaGravada) return 'A página foi trocada durante a gravação. Exporte de novo.'
      if (designRef.current !== designGravado) return 'A página foi editada durante a gravação. Exporte de novo.'
      return null
    }

    try {
      const { webm: videoBlob, duracao: exportedDuration, capa } = await exportVideoWithLayers(
        stage,
        videoLayer ?? null,
        designGravado,
        {
          setSelectedLayerIds: selectLayersFn,
          selectedLayerIdsRef,
          zoom,
          setZoomState,
        },
        {
          fps: 30,
          quality: 0.8,
          audioConfig,
          relogio: relogioDaPagina(paginaGravada),
          cancelado,
        },
        (progress) => {
          setExportProgress(progress)
        }
      )

      setExportProgress({ phase: 'uploading', progress: 45 })

      // Capa definida no painel de vídeo tem prioridade; sem capa, o quadro 0
      // que a gravação capturou (primeiro clipe, vídeos no início do trecho)
      let thumbnailBlob: Blob
      const posterUrl = videoLayer?.videoMetadata?.posterUrl
      if (posterUrl) {
        try {
          const posterResponse = await fetch(posterUrl)
          if (!posterResponse.ok) throw new Error(`HTTP ${posterResponse.status}`)
          thumbnailBlob = await posterResponse.blob()
        } catch (error) {
          console.warn('[Video Export] Falha ao usar posterUrl como capa, capturando frame:', error)
          thumbnailBlob = await dataUrlToBlob(capa)
        }
      } else {
        thumbnailBlob = await dataUrlToBlob(capa)
      }

      const videoUploadPath = generateUploadPath(clerkUserId, designName)
      const thumbnailUploadPath = generateThumbnailUploadPath(clerkUserId, designName)

      const thumbnailUpload = await upload(thumbnailUploadPath, thumbnailBlob, {
        access: 'public',
        contentType: 'image/jpeg',
        handleUploadUrl: '/api/video-processing/upload',
      })

      setExportProgress({ phase: 'uploading', progress: 55 })

      const videoUpload = await upload(videoUploadPath, videoBlob, {
        access: 'public',
        contentType: 'video/webm',
        handleUploadUrl: '/api/video-processing/upload',
        multipart: videoBlob.size > 15 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => {
          if (typeof percentage === 'number') {
            setExportProgress({
              phase: 'uploading',
              progress: 55 + Math.min(percentage * 0.4, 40),
            })
          }
        },
      })

      setExportProgress({ phase: 'uploading', progress: 95 })

      const queueJson = await api.post<{ jobId?: string; generationId?: string }>('/api/video-processing/queue', {
        templateId,
        projectId: resolvedProjectId,
        videoName: designName || 'vídeo',
        videoDuration: exportedDuration,
        videoWidth: design.canvas.width,
        videoHeight: design.canvas.height,
        webmBlobUrl: videoUpload.url,
        webmBlobSize: videoBlob.size,
        thumbnailBlobUrl: thumbnailUpload.url,
        thumbnailBlobSize: thumbnailBlob.size,
        designData: designGravado,
        // O WebM acima é MUDO — a fila mixa a trilha via ffmpeg a partir daqui
        // O PEDIDO, não o efetivo: a fila decide a fonte (`fonteEfetiva`) e
        // grava o aviso na Generation — enviado já trocado, o aviso se perdia.
        audioConfig,
        // A página gravada e para onde o MP4 vai. Quem processa é a própria
        // rota da fila (o navegador não aciona mais nada depois daqui).
        ...(paginaGravada ? { pageId: paginaGravada } : {}),
        destino,
      })

      const { jobId, generationId } = queueJson
      if (!jobId) {
        throw new Error('Resposta inválida ao enfileirar vídeo')
      }

      if (generationId) {
        window.dispatchEvent(
          new CustomEvent('video-export-queued', {
            detail: {
              jobId,
              generationId,
              projectId: resolvedProjectId,
              thumbnailUrl: thumbnailUpload.url,
              progress: 0,
              status: 'PENDING',
            },
          })
        )
      }

      pollJobStatus(jobId, generationId, resolvedProjectId, paginaGravada)
      // A substituição pedida já aparece na faixa da página ("em produção")
      queryClient.invalidateQueries({ queryKey: ['agenda-das-paginas', templateId] })
      setNaFila(destinoTexto)
      toast({ title: 'Vídeo na fila', description: 'Pode fechar esta janela. Avisamos quando ficar pronto.' })
      aoEnfileirar?.(destino)
    } catch (_error) {
      console.error('Export error:', _error)
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar vídeo',
        description:
          _error instanceof Error ? _error.message.replace(/: \[object Object\]$/, '') : 'Erro desconhecido',
      })
    } finally {
      setIsExporting(false)
      setExportProgress(null)
    }
  }

  const getProgressText = () => {
    if (!exportProgress) return ''

    switch (exportProgress.phase) {
      case 'preparing':
        return 'Preparando a gravação…'
      case 'recording':
        return 'Gravando — deixe esta aba aberta e visível'
      case 'converting':
      case 'finalizing':
        return 'Finalizando a gravação…'
      case 'uploading':
        return 'Enviando — ainda não feche esta janela'
      case 'queued':
        return 'Na fila'
      default:
        return ''
    }
  }

  const contexto = React.useMemo<GerarVideo>(
    () => ({ abrir, indisponivel: !hasCredits || !browserSupport.supported }),
    [abrir, hasCredits, browserSupport.supported],
  )

  return (
    <GerarVideoContext.Provider value={contexto}>
      {children}

      <Dialog open={isOpen} onOpenChange={fechar}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Gerar vídeo</DialogTitle>
            <DialogDescription>
              A gravação leva o tempo do vídeo: deixe esta aba aberta e visível até o vídeo entrar
              na fila. Depois disso pode fechar e continuar editando.
            </DialogDescription>
          </DialogHeader>

          {naFila ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Na fila — pode fechar esta janela</p>
                <p className="text-xs text-muted-foreground">{naFila}</p>
              </div>
            </div>
          ) : (
          <div className="flex-1 space-y-5 overflow-y-auto py-2 pr-1 -mr-1">
            {!browserSupport.supported && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Navegador não suportado</p>
                  <p className="text-xs text-muted-foreground">{browserSupport.message}</p>
                </div>
              </div>
            )}

            {!paginaVideo && (
              <p className="rounded-xl border bg-background p-3 text-sm text-muted-foreground">
                Esta página não tem vídeo nem música — não há o que gerar como vídeo.
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Créditos necessários</p>
                    <p className="text-xs text-muted-foreground">
                      Você tem {credits?.creditsRemaining || 0} créditos disponíveis
                    </p>
                  </div>
                  <div className="text-2xl font-bold">{creditCost}</div>
                </div>
                {!hasCredits && (
                  <p className="mt-3 text-xs font-medium text-destructive">
                    Saldo insuficiente para exportar este vídeo.
                  </p>
                )}
              </div>

              <div className="rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-semibold">Formato do arquivo</p>
                  <Badge variant="secondary">MP4</Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  MP4 (H.264), compatível com todas as plataformas. A conversão é feita em segundo
                  plano.
                </p>
              </div>
            </div>

            <div className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="flex items-center gap-3">
                {hasSelectedMusic && audioConfig.musicThumbnailUrl ? (
                  <Image
                    src={audioConfig.musicThumbnailUrl}
                    alt={audioConfig.musicName ?? 'Trilha'}
                    width={44}
                    height={44}
                    unoptimized
                    className="h-11 w-11 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Music className="h-5 w-5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Trilha sonora</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {audioConfig.source === 'library'
                      ? audioConfig.musicName
                        ? `${audioConfig.musicName}${
                            audioConfig.audioVersion === 'instrumental'
                              ? ' • Instrumental'
                              : audioConfig.audioVersion === 'vocals'
                                ? ' • Só a voz'
                                : ''
                          }`
                        : 'Música da biblioteca'
                      : audioConfig.source === 'mix'
                        ? audioConfig.musicName
                          ? `Áudio do vídeo + ${audioConfig.musicName}`
                          : 'Mix: áudio do vídeo + música'
                        : audioConfig.source === 'mute'
                          ? 'Sem áudio (mudo)'
                          : semSomOriginal
                            ? 'Sem som: esta página não tem vídeo com áudio. Escolha uma música.'
                            : 'Usando o áudio do próprio vídeo'}
                  </p>
                </div>

                <Button
                  variant={hasSelectedMusic ? 'outline' : 'default'}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setIsAudioModalOpen(true)}
                  disabled={isExporting}
                >
                  <Music className="mr-2 h-4 w-4" />
                  {hasSelectedMusic ? 'Trocar' : 'Escolher música'}
                </Button>
              </div>

              {(audioConfig.source === 'library' || audioConfig.source === 'mix') && (
                <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                  Trecho: {audioConfig.startTime.toFixed(1)}s → {audioConfig.endTime.toFixed(1)}s
                  {' • '}Volume{' '}
                  {audioConfig.source === 'mix'
                    ? `${audioConfig.volumeMusic ?? audioConfig.volume}%`
                    : `${audioConfig.volume}%`}
                </p>
              )}
            </div>

            <div className="rounded-xl border bg-background p-4 shadow-sm">
              <p className="text-sm font-semibold">Depois de gerar</p>
              <RadioGroup
                value={escolha}
                onValueChange={(v) => mexer(setEscolha)(v as EscolhaDeDestino)}
                className="mt-3 grid gap-2"
                disabled={isExporting}
              >
                {postDaPagina && (
                  <label htmlFor="destino-substituir" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="substituir" id="destino-substituir" />
                    <div>
                      <p className="text-sm font-medium">
                        Substituir o vídeo de {postDaPagina.quando ? rotuloCurto(new Date(postDaPagina.quando)) : 'post da agenda'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        O post continua no mesmo horário, com o vídeo novo.
                        {postDaPagina.videoDesatualizado ? ' A página mudou depois do vídeo que está lá.' : ''}
                      </p>
                    </div>
                  </label>
                )}
                {currentPageId && (
                  <label htmlFor="destino-agenda" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="agenda" id="destino-agenda" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Colocar na agenda</p>
                      <p className="text-xs text-muted-foreground">
                        O post é criado quando o vídeo ficar pronto.
                        {postDaPagina ? ' Esta página já tem um vídeo na agenda: isto cria outro post.' : ''}
                      </p>
                    </div>
                  </label>
                )}
                <label htmlFor="destino-galeria" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="galeria" id="destino-galeria" />
                  <div>
                    <p className="text-sm font-medium">Só guardar na galeria</p>
                    <p className="text-xs text-muted-foreground">O MP4 fica na aba Criativos para agendar depois.</p>
                  </div>
                </label>
              </RadioGroup>

              {escolha === 'agenda' && currentPageId && (
                <div className="mt-4 grid gap-3 border-t pt-3">
                  <label className="grid gap-1 text-xs font-medium">
                    Data e hora
                    <Input
                      type="datetime-local"
                      value={quandoCampo}
                      onChange={(e) => mexer(setQuandoCampo)(e.target.value)}
                      disabled={isExporting}
                    />
                  </label>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <RadioGroup
                      value={postType}
                      onValueChange={(v) => mexer(setPostType)(v as 'STORY' | 'REEL')}
                      className="flex gap-3"
                      disabled={isExporting}
                    >
                      {tipos.map((t) => (
                        <label key={t} htmlFor={`tipo-${t}`} className="flex cursor-pointer items-center gap-1.5">
                          <RadioGroupItem value={t} id={`tipo-${t}`} />
                          {t === 'STORY' ? 'Story' : 'Reel'}
                        </label>
                      ))}
                    </RadioGroup>
                    <RadioGroup
                      value={situacao}
                      onValueChange={(v) => mexer(setSituacao)(v as 'agendado' | 'rascunho')}
                      className="flex gap-3"
                      disabled={isExporting}
                    >
                      <label htmlFor="situacao-agendado" className="flex cursor-pointer items-center gap-1.5">
                        <RadioGroupItem value="agendado" id="situacao-agendado" />
                        Agendado
                      </label>
                      <label htmlFor="situacao-rascunho" className="flex cursor-pointer items-center gap-1.5">
                        <RadioGroupItem value="rascunho" id="situacao-rascunho" />
                        Rascunho
                      </label>
                    </RadioGroup>
                  </div>
                  {postType === 'REEL' && (
                    <label className="grid gap-1 text-xs font-medium">
                      Legenda
                      <Textarea
                        value={legenda}
                        onChange={(e) => mexer(setLegenda)(e.target.value)}
                        maxLength={2200}
                        rows={3}
                        disabled={isExporting}
                      />
                    </label>
                  )}
                </div>
              )}

              {problema && <p className="mt-3 text-xs font-medium text-destructive">{problema}</p>}
            </div>

            {isExporting && exportProgress && (
              <div className="rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{getProgressText()}</span>
                  <span className="font-semibold">{Math.round(exportProgress.progress)}%</span>
                </div>
                <Progress value={exportProgress.progress} className="mt-3 h-2.5" />
              </div>
            )}
          </div>
          )}

          <DialogFooter className="gap-2">
            {naFila ? (
              <Button onClick={() => fechar(false)}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => fechar(false)} disabled={isExporting}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={
                    !paginaVideo || !hasCredits || isExporting || !browserSupport.supported || fatiaCurta || !!problema
                  }
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Gerar vídeo ({creditCost} créditos)
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Seleção de Áudio */}
      {isAudioModalOpen && (
      <AudioSelectionModal
        open={isAudioModalOpen}
        onOpenChange={setIsAudioModalOpen}
        videoDuration={videoDuration ?? 10}
        temSomOriginal={!semSomOriginal}
        currentConfig={audioConfig}
        onConfirm={(config) => {
          setAudioConfig(config)
          // Persiste na página (Page.audio via PageSync) — é a mesma config
          // que a aba Músicas edita
          editorContext.setPageAudio(config)
          toast({
            title: 'Trilha sonora salva na página',
            description: 'A configuração vale para este export e fica salva no template.',
          })
        }}
      />
      )}
    </GerarVideoContext.Provider>
  )
}
