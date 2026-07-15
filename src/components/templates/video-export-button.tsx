"use client"

import * as React from 'react'
import Image from 'next/image'
import { Download, Loader2, Film, AlertCircle, Music } from 'lucide-react'
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
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useCredits } from '@/hooks/use-credits'
import {
  exportVideoWithLayers,
  checkVideoExportSupport,
  type VideoExportProgress,
  generateVideoThumbnail,
} from '@/lib/konva/konva-video-export'
import { AudioSelectionModal, type AudioConfig } from '@/components/audio/audio-selection-modal'
import Konva from 'konva'
import { upload } from '@vercel/blob/client'
import { createId } from '@/lib/id'

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

export function VideoExportButton() {
  const editorContext = useTemplateEditor()
  const { design, zoom, templateId, projectId } = editorContext
  const designName =
    typeof (design as { name?: string }).name === 'string' ? (design as { name?: string }).name! : 'Sem título'
  const { toast } = useToast()
  const { userId: clerkUserId } = useAuth()
  const { canPerformOperation, getCost, credits } = useCredits()

  const videoLayer = design.layers.find((layer) => layer.type === 'video')
  const hasVideo = !!videoLayer

  const [isOpen, setIsOpen] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [exportProgress, setExportProgress] = React.useState<VideoExportProgress | null>(null)
  const [exportFormat, setExportFormat] = React.useState<'webm' | 'mp4'>('mp4')

  // Estados para configuração de áudio
  const [isAudioModalOpen, setIsAudioModalOpen] = React.useState(false)
  const [videoDuration, setVideoDuration] = React.useState<number | null>(null)
  const [audioConfig, setAudioConfig] = React.useState<AudioConfig>({
    source: 'original',
    startTime: 0,
    endTime: 10, // Será atualizado quando a duração real for detectada
    volume: 80,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
  })

  // Refs para acessar selectedLayerIds e setZoom dentro da função de exportação
  const selectedLayerIdsRef = React.useRef<string[]>(editorContext.selectedLayerIds)
  const setZoomState = editorContext.setZoom
  const selectLayersFn = editorContext.selectLayers

  // Manter ref atualizada
  React.useEffect(() => {
    selectedLayerIdsRef.current = editorContext.selectedLayerIds
  }, [editorContext.selectedLayerIds])

  // Obter duração real do vídeo através do Konva Stage
  React.useEffect(() => {
    if (!videoLayer) {
      console.log('[Video Export] ❌ videoLayer não existe')
      return
    }

    console.log('[Video Export] 🔍 Iniciando detecção de duração do vídeo...')
    console.log('[Video Export] VideoLayer ID:', videoLayer.id)
    console.log('[Video Export] VideoLayer fileUrl:', videoLayer.fileUrl)

    let attempts = 0
    const maxAttempts = 30
    const retryDelay = 300

    const findAndUpdateDuration = () => {
      attempts++
      console.log(`[Video Export] 🔎 Tentativa ${attempts}/${maxAttempts}`)

      // Buscar o vídeo através do Konva Stage
      const findVideoFromKonva = (): HTMLVideoElement | null => {
        // Tentar encontrar o stage Konva
        const stages = (Konva as typeof Konva).stages
        console.log('[Video Export] 📦 Konva.stages disponíveis:', stages?.length || 0)

        if (!stages || stages.length === 0) {
          console.log('[Video Export] ⚠️ Nenhum Konva Stage encontrado')
          return null
        }

        // Procurar em todos os stages
        for (const stage of stages) {
          // Buscar o Image node com o ID do videoLayer
          const node = stage.findOne(`#${videoLayer.id}`)

          if (node) {
            console.log('[Video Export] 🎯 Konva node encontrado:', videoLayer.id)

            // Verificar se é realmente um Konva.Image antes de chamar .image()
            if (node instanceof Konva.Image) {
              console.log('[Video Export] ✅ Node é um Konva.Image')

              // Pegar o elemento de vídeo HTML do Konva Image
              const videoElement = node.image() as HTMLVideoElement

              if (videoElement && videoElement.tagName === 'VIDEO') {
                console.log('[Video Export] ✅ Elemento de vídeo obtido do Konva Image:', {
                  src: videoElement.src?.substring(0, 50) + '...',
                  duration: videoElement.duration,
                  readyState: videoElement.readyState,
                })
                return videoElement
              } else {
                console.log('[Video Export] ⚠️ Image node não contém vídeo válido')
              }
            } else {
              console.log('[Video Export] ⚠️ Node encontrado mas não é um Konva.Image:', node.getType())
            }
          }
        }

        console.log('[Video Export] ❌ Vídeo não encontrado em nenhum Konva Stage')
        return null
      }

      const videoElement = findVideoFromKonva()

      if (!videoElement) {
        if (attempts < maxAttempts) {
          console.log(`[Video Export] ⏳ Aguardando ${retryDelay}ms antes da próxima tentativa...`)
          setTimeout(findAndUpdateDuration, retryDelay)
        } else {
          console.error('[Video Export] ❌ Elemento de vídeo não encontrado após', maxAttempts, 'tentativas')
        }
        return
      }

      const updateDuration = () => {
        console.log('[Video Export] 📊 Atualizando duração...')
        console.log('[Video Export] Duration:', videoElement.duration)
        console.log('[Video Export] ReadyState:', videoElement.readyState)

        if (videoElement.duration && Number.isFinite(videoElement.duration) && videoElement.duration > 0) {
          const realDuration = videoElement.duration
          console.log('[Video Export] ✅✅✅ DURAÇÃO REAL DETECTADA:', realDuration.toFixed(2), 'segundos')
          setVideoDuration(realDuration)

          setAudioConfig(prev => {
            console.log('[Video Export] Atualizando audioConfig.endTime de', prev.endTime, 'para', realDuration)
            return {
              ...prev,
              endTime: realDuration,
            }
          })
        } else if (attempts < maxAttempts) {
          console.log(`[Video Export] ⚠️ Vídeo sem duração válida (${videoElement.duration}), tentando novamente...`)
          setTimeout(findAndUpdateDuration, retryDelay)
        } else {
          console.error('[Video Export] ❌ Não foi possível obter duração válida após', maxAttempts, 'tentativas')
        }
      }

      // Se já está carregado
      if (videoElement.readyState >= 1) {
        console.log('[Video Export] 📺 Vídeo já está carregado (readyState >= 1)')
        updateDuration()
      } else {
        console.log('[Video Export] ⏳ Aguardando evento loadedmetadata...')
        videoElement.addEventListener('loadedmetadata', () => {
          console.log('[Video Export] 🎬 Evento loadedmetadata disparado!')
          updateDuration()
        }, { once: true })
        setTimeout(findAndUpdateDuration, retryDelay)
      }
    }

    // Iniciar busca com delay para dar tempo do Konva renderizar
    setTimeout(() => {
      console.log('[Video Export] 🚀 Iniciando busca através do Konva Stage...')
      findAndUpdateDuration()
    }, 1000) // 1 segundo de delay inicial para garantir que o Konva renderizou
  }, [videoLayer])

  const creditCost = getCost('video_export')
  const hasCredits = canPerformOperation('video_export')
  const hasSelectedMusic =
    (audioConfig.source === 'library' || audioConfig.source === 'mix') && !!audioConfig.musicId

  // Verificar suporte do navegador
  const browserSupport = React.useMemo(() => checkVideoExportSupport(), [])

  const pollJobStatus = React.useCallback(
    (jobId: string, initialGenerationId?: string, projectIdParam?: number) => {
      console.log('[VideoExportQueue] Iniciando polling para job:', jobId)
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
          const response = await fetch(`/api/video-processing/status/${jobId}`)
          if (!response.ok) {
            console.error('[VideoExportQueue] Erro na resposta:', response.status)
            clearInterval(interval)
            return
          }

          const job = await response.json()
          const currentGenerationId: string | undefined =
            (typeof job?.generationId === 'string' ? job.generationId : undefined) ?? linkedGenerationId
          linkedGenerationId = currentGenerationId

          const resolvedProgress =
            typeof job.progress === 'number'
              ? job.progress
              : job.status === 'COMPLETED'
                ? 100
                : job.status === 'FAILED'
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
          }

          window.dispatchEvent(new CustomEvent('video-export-progress', { detail }))

          if (job.status === 'COMPLETED') {
            clearInterval(interval)
            toast({
              title: '🎉 Vídeo pronto!',
              description: 'Seu MP4 está disponível na aba Criativos.',
              duration: 8000,
            })
            window.dispatchEvent(new CustomEvent('video-export-completed', { detail }))
          } else if (job.status === 'FAILED') {
            clearInterval(interval)
            toast({
              variant: 'destructive',
              title: 'Erro no processamento',
              description: job.errorMessage || 'Falha ao converter o vídeo.',
            })
            window.dispatchEvent(
              new CustomEvent('video-export-failed', {
                detail: {
                  ...detail,
                  errorMessage: job.errorMessage,
                },
              })
            )
          }
        } catch (error) {
          console.error('[VideoExportQueue] Polling error:', error)
          clearInterval(interval)
        }
      }, 5000)

      return () => clearInterval(interval)
    },
    [toast]
  )

  const handleExport = async () => {
    if (!hasVideo || !videoLayer) {
      toast({
        variant: 'destructive',
        description: 'Nenhum vídeo encontrado no design',
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

    if (exportFormat !== 'mp4') {
      toast({
        variant: 'destructive',
        description: 'A fila de processamento está disponível apenas para MP4 no momento.',
      })
      setExportFormat('mp4')
      return
    }

    const stageElement = document.querySelector('.konvajs-content')
    const stage = stageElement
      ? Konva.stages.find((s) => s.container() === stageElement.parentElement)
      : null

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

    setIsExporting(true)
    setExportProgress({ phase: 'preparing', progress: 10 })

    try {
      const videoBlob = await exportVideoWithLayers(
        stage,
        videoLayer,
        design,
        {
          setSelectedLayerIds: selectLayersFn,
          selectedLayerIdsRef,
          zoom,
          setZoomState,
        },
        {
          fps: 30,
          format: 'webm',
          quality: 0.8,
          audioConfig,
        },
        (progress) => {
          setExportProgress(progress)
        }
      )

      setExportProgress({ phase: 'preparing', progress: 45 })

      const thumbnailDataUrl = await generateVideoThumbnail(stage, videoLayer)
      const thumbnailBlob = await dataUrlToBlob(thumbnailDataUrl)

      const videoUploadPath = generateUploadPath(clerkUserId, designName)
      const thumbnailUploadPath = generateThumbnailUploadPath(clerkUserId, designName)

      toast({
        title: 'Gerando vídeo...',
        description: 'Estamos preparando o arquivo e enviando para processamento.',
      })

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

      const exportedDuration =
        audioConfig?.source === 'library'
          ? audioConfig.endTime - audioConfig.startTime
          : videoDuration || videoLayer.videoMetadata?.duration || 10

      const queuePayload = {
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
        designData: design,
      }

      console.log('[Video Export] Enviando para fila:', {
        ...queuePayload,
        designData: '[omitido]' // Não logar design completo
      })

      const queueResponse = await fetch('/api/video-processing/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queuePayload),
      })

      const queueJson = await queueResponse.json()
      if (!queueResponse.ok) {
        console.error('[Video Export] Erro ao adicionar à fila:', {
          status: queueResponse.status,
          statusText: queueResponse.statusText,
          response: queueJson
        })
        const message = queueJson?.error || queueJson?.message || 'Falha ao adicionar vídeo à fila'
        const details = queueJson?.details ? ` - ${JSON.stringify(queueJson.details)}` : ''
        throw new Error(message + details)
      }

      const { jobId, generationId } = queueJson as { jobId?: string; generationId?: string }
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

      setExportProgress({ phase: 'queued', progress: 100 })

      void fetch('/api/video-processing/process', { method: 'POST' }).catch((error) => {
        console.warn('[VideoExportQueue] Falha ao acionar processamento imediato:', error)
      })

      pollJobStatus(jobId, generationId, resolvedProjectId)

      toast({
        title: 'Vídeo na fila de processamento',
        description: 'Continue sendo criativo! Avisaremos quando o MP4 aparecer na aba Criativos.',
      })

      setIsOpen(false)
    } catch (_error) {
      console.error('Export error:', _error)
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar vídeo',
        description: _error instanceof Error ? _error.message : 'Erro desconhecido',
      })
    } finally {
      setIsExporting(false)
      setExportProgress(null)
    }
  }

  if (!hasVideo) return null

  const getProgressText = () => {
    if (!exportProgress) return ''

    switch (exportProgress.phase) {
      case 'preparing':
        return 'Preparando exportação...'
      case 'recording':
        return 'Gravando vídeo...'
      case 'converting':
        return 'Convertendo para MP4...'
      case 'finalizing':
        return 'Finalizando...'
      case 'uploading':
        return 'Enviando vídeo para processamento...'
      case 'queued':
        return 'Vídeo adicionado à fila...'
      default:
        return ''
    }
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="default"
        size="sm"
        className="gap-2"
        disabled={!hasCredits || !browserSupport.supported}
      >
        <Film className="h-4 w-4" />
        Exportar Vídeo
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Exportar vídeo final</DialogTitle>
            <DialogDescription>
              O MP4 é enviado para a fila de processamento. Você pode continuar editando e será
              avisado quando ele aparecer na aba Criativos.
            </DialogDescription>
          </DialogHeader>

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
                <RadioGroup value={exportFormat} className="mt-3 grid gap-3">
                  <label
                    htmlFor="mp4"
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary bg-primary/5 p-3"
                  >
                    <RadioGroupItem value="mp4" id="mp4" />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        MP4 (H.264)
                        <Badge variant="outline" className="text-[10px]">
                          Fila automática
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Compatível com todas as plataformas. Processamos em segundo plano e o MP4
                        aparecerá na aba Criativos.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
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
                        ? `${audioConfig.musicName}${audioConfig.audioVersion === 'instrumental' ? ' • Instrumental' : ''}`
                        : 'Música da biblioteca'
                      : audioConfig.source === 'mix'
                        ? audioConfig.musicName
                          ? `Áudio do vídeo + ${audioConfig.musicName}`
                          : 'Mix: áudio do vídeo + música'
                        : audioConfig.source === 'mute'
                          ? 'Sem áudio (mudo)'
                          : 'Usando o áudio do próprio vídeo'}
                  </p>
                </div>

                <Button
                  variant={hasSelectedMusic ? 'outline' : 'default'}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setIsAudioModalOpen(true)}
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

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isExporting}>
              Cancelar
            </Button>
            <Button
              onClick={handleExport}
              disabled={!hasCredits || isExporting || !browserSupport.supported}
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exportando
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar ({creditCost} créditos)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Seleção de Áudio */}
      <AudioSelectionModal
        open={isAudioModalOpen}
        onOpenChange={setIsAudioModalOpen}
        videoDuration={videoDuration || 10}
        currentConfig={audioConfig}
        onConfirm={(config) => {
          setAudioConfig(config)
          toast({
            title: 'Configuração de áudio salva',
            description: 'As configurações de áudio serão aplicadas na exportação',
          })
        }}
      />
    </>
  )
}
