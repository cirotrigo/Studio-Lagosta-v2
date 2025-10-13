"use client"

import * as React from 'react'
import { upload } from '@vercel/blob/client'
import { useAuth } from '@clerk/nextjs'
import { Film, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useCredits } from '@/hooks/use-credits'
import { exportVideoWithLayers, generateVideoThumbnail } from '@/lib/konva/konva-video-export'
import { validateInstagramFormat } from '@/lib/templates/instagram-presets'
import { createId } from '@/lib/id'
import Konva from 'konva'

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'video'
}

function generateUploadPath(clerkUserId: string, videoName: string) {
  const randomSuffix = createId()
  return `video-processing/${clerkUserId}/${Date.now()}-${randomSuffix}-${sanitizeFileName(videoName)}.webm`
}

function generateThumbnailUploadPath(clerkUserId: string, videoName: string) {
  const randomSuffix = createId()
  return `video-thumbnails/${clerkUserId}/${Date.now()}-${randomSuffix}-${sanitizeFileName(videoName)}.jpg`
}

async function parseJsonResponse(response: Response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text }
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return await response.blob()
}

export function VideoExportQueueButton() {
  const editorContext = useTemplateEditor()
  const { design, zoom, templateId, projectId } = editorContext
  const { toast } = useToast()
  const { canPerformOperation, getCost } = useCredits()
  const { userId: clerkUserId } = useAuth()

  const [isExporting, setIsExporting] = React.useState(false)

  const selectedLayerIdsRef = React.useRef<string[]>(editorContext.selectedLayerIds)
  const setZoomState = editorContext.setZoom
  const selectLayersFn = editorContext.selectLayers

  React.useEffect(() => {
    selectedLayerIdsRef.current = editorContext.selectedLayerIds
  }, [editorContext.selectedLayerIds])

  const videoLayer = design.layers.find((layer) => layer.type === 'video')
  const hasVideo = !!videoLayer

  const creditCost = getCost('video_export')
  const hasCredits = canPerformOperation('video_export')

  const validation = React.useMemo(() => {
    if (!videoLayer) return null

    return validateInstagramFormat(
      design.canvas.width,
      design.canvas.height,
      videoLayer.videoMetadata?.duration ?? 0
    )
  }, [
    design.canvas.width,
    design.canvas.height,
    videoLayer?.id,
    videoLayer?.videoMetadata?.duration,
  ])

  const handleExportToQueue = async () => {
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

    setIsExporting(true)

    try {
      // 1. Exportar WebM localmente
      toast({
        title: 'Gerando vídeo...',
        description: 'Aguarde enquanto preparamos seu vídeo.',
      })

      const webmBlob = await exportVideoWithLayers(
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
          format: 'webm', // Sempre WebM para upload
          quality: 0.8,
        }
      )

      if (!clerkUserId) {
        throw new Error('Sessão expirada. Faça login novamente para continuar.')
      }

      // 2. Gerar thumbnail do vídeo para exibição imediata
      let thumbnailUploadResult: Awaited<ReturnType<typeof upload>> | null = null
      let thumbnailBlobSize = 0

      try {
        const thumbnailDataUrl = await generateVideoThumbnail(stage, videoLayer)
        const thumbnailBlob = await dataUrlToBlob(thumbnailDataUrl)
        thumbnailBlobSize = thumbnailBlob.size

        const thumbnailUploadPath = generateThumbnailUploadPath(clerkUserId, design.name || 'video')

        thumbnailUploadResult = await upload(thumbnailUploadPath, thumbnailBlob, {
          access: 'public',
          contentType: 'image/jpeg',
          handleUploadUrl: '/api/video-processing/upload',
          onUploadProgress: ({ percentage }) => {
            if (typeof percentage === 'number') {
              console.log(`[VideoExportQueue] Thumbnail upload progress: ${percentage.toFixed(0)}%`)
            }
          },
        })

        console.log('[VideoExportQueue] Thumbnail upload concluído:', thumbnailUploadResult.url)
      } catch (thumbnailError) {
        console.error('[VideoExportQueue] Erro ao gerar/enviar thumbnail:', thumbnailError)
        toast({
          variant: 'destructive',
          title: 'Erro ao gerar thumbnail',
          description: 'Não foi possível criar a thumbnail do vídeo. Tente novamente.',
        })
        throw thumbnailError
      }

      if (!thumbnailUploadResult) {
        throw new Error('Falha ao enviar thumbnail do vídeo')
      }

      // 3. Upload direto do WebM para o Vercel Blob
      const uploadPath = generateUploadPath(clerkUserId, design.name || 'video')

      toast({
        title: 'Enviando vídeo...',
        description: 'Transferindo arquivo para o armazenamento seguro.',
      })

      const uploadResult = await upload(uploadPath, webmBlob, {
        access: 'public',
        contentType: 'video/webm',
        handleUploadUrl: '/api/video-processing/upload',
        multipart: webmBlob.size > 15 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => {
          if (typeof percentage === 'number') {
            console.log(`[VideoExportQueue] Upload progress: ${percentage.toFixed(0)}%`)
          }
        },
      })

      console.log('[VideoExportQueue] Upload concluído:', uploadResult.url)

      // 4. Enviar metadados para fila
      toast({
        title: 'Adicionando à fila...',
        description: 'Seu vídeo está sendo enviado para processamento.',
      })

      const response = await fetch('/api/video-processing/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          projectId,
          videoName: design.name || 'video',
          videoDuration: videoLayer.videoMetadata?.duration || 10,
          videoWidth: design.canvas.width,
          videoHeight: design.canvas.height,
          webmBlobUrl: uploadResult.url,
          webmBlobSize: webmBlob.size,
          thumbnailBlobUrl: thumbnailUploadResult.url,
          thumbnailBlobSize,
          designData: design,
        }),
      })

      const json = await parseJsonResponse(response)

      if (!response.ok) {
        const extractDetail = (value: unknown): string | null => {
          if (!value) return null
          if (typeof value === 'string') return value
          try {
            return JSON.stringify(value)
          } catch {
            return null
          }
        }

        const serverMessage =
          (json && (json.error || json.message)) ||
          (typeof json === 'string' ? json : null)
        const detailMessage =
          extractDetail(json?.details) ||
          extractDetail(json?.detail) ||
          extractDetail(json?.errors)

        const combinedMessage =
          serverMessage && detailMessage && !detailMessage.includes(serverMessage)
            ? `${serverMessage}: ${detailMessage}`
            : serverMessage || detailMessage

        throw new Error(combinedMessage || 'Falha ao adicionar vídeo à fila')
      }

      const { jobId, generationId } = json as { jobId?: string; generationId?: string }
      if (!jobId) {
        throw new Error('Resposta inválida ao enfileirar vídeo')
      }

      if (generationId) {
        window.dispatchEvent(
          new CustomEvent('video-export-queued', {
            detail: {
              jobId,
              generationId,
              projectId,
              thumbnailUrl: thumbnailUploadResult.url,
              progress: 0,
              status: 'PENDING',
            },
          })
        )
      }

      // Aciona o processamento imediato do próximo job na fila (ambiente local/dev)
      void fetch('/api/video-processing/process', {
        method: 'POST',
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}))
            const message =
              errorBody?.details ||
              errorBody?.error ||
              `Status ${response.status}`
            console.warn('[VideoExportQueue] Process trigger failed:', message)
          }
        })
        .catch((triggerError) => {
          console.warn('[VideoExportQueue] Falha ao acionar processamento imediato:', triggerError)
        })

      // 5. Iniciar polling do status
      pollJobStatus(jobId, generationId, typeof projectId === 'number' ? projectId : undefined)

      const formatInfo = validation?.preset
        ? `${validation.preset.name} (${validation.preset.aspectRatio})`
        : `${design.canvas.width}x${design.canvas.height}`

      toast({
        title: 'Vídeo adicionado à fila! ✅',
        description: validation?.valid
          ? `Formato Instagram pronto: ${formatInfo}. Você será notificado quando o MP4 estiver pronto.`
          : `Formato atual: ${formatInfo}. Você será notificado quando o MP4 estiver pronto.`,
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar vídeo',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      })
    } finally {
      setIsExporting(false)
    }
  }

  const pollJobStatus = (jobId: string, initialGenerationId?: string, projectId?: number) => {
    console.log('[VideoExportQueue] Iniciando polling para job:', jobId)
    let pollCount = 0
    const maxPolls = 60 // Máximo 5 minutos (60 * 5s)
    let linkedGenerationId = initialGenerationId

    const interval = setInterval(async () => {
      pollCount++
      console.log(`[VideoExportQueue] Poll #${pollCount} para job: ${jobId}`)

      if (pollCount > maxPolls) {
        console.warn('[VideoExportQueue] Polling timeout')
        clearInterval(interval)
        toast({
          variant: 'destructive',
          title: 'Timeout',
          description: 'O processamento está demorando muito. Verifique a aba Criativos mais tarde.',
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
        console.log('[VideoExportQueue] Status do job:', job.status, 'Progresso:', job.progress)

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

        const baseDetail = {
          jobId,
          generationId: currentGenerationId ?? null,
          projectId,
          progress: resolvedProgress,
          status: job.status,
          mp4ResultUrl: job.mp4ResultUrl,
          thumbnailUrl: job.thumbnailUrl,
        }

        window.dispatchEvent(new CustomEvent('video-export-progress', { detail: baseDetail }))

        if (job.status === 'COMPLETED') {
          console.log('[VideoExportQueue] Job concluído! URL:', job.mp4ResultUrl)
          clearInterval(interval)

          toast({
            title: '🎉 Vídeo Pronto!',
            description: 'Seu vídeo MP4 está disponível na aba Criativos.',
            duration: 10000,
          })

          // Disparar evento para atualizar lista de criativos
          window.dispatchEvent(new CustomEvent('video-export-completed', { detail: baseDetail }))
        } else if (job.status === 'FAILED') {
          console.error('[VideoExportQueue] Job falhou:', job.errorMessage)
          clearInterval(interval)

          toast({
            variant: 'destructive',
            title: 'Erro no processamento',
            description: job.errorMessage || 'Falha ao processar vídeo',
          })

          window.dispatchEvent(
            new CustomEvent('video-export-failed', {
              detail: {
                ...baseDetail,
                errorMessage: job.errorMessage,
              },
            })
          )
        } else if (job.status === 'PROCESSING') {
          // Atualizar progresso
          console.log('[VideoExportQueue] Processando... Progresso:', job.progress)
        }
      } catch (error) {
        console.error('[VideoExportQueue] Polling error:', error)
        clearInterval(interval)
      }
    }, 5000) // Poll a cada 5 segundos

    // Retornar função de cleanup
    return () => clearInterval(interval)
  }

  if (!hasVideo) return null

  return (
    <div className="space-y-2">
      {validation ? (
        validation.valid ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <Badge
              variant="secondary"
              className="border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
            >
              Instagram Ready
            </Badge>
            {validation.preset ? (
              <span>{`${validation.preset.name} (${validation.preset.aspectRatio})`}</span>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-400/30 dark:text-yellow-200">
            <p className="font-medium">Formato não otimizado para Instagram</p>
            <ul className="mt-1 space-y-1">
              {validation.warnings.map((warning, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      <Button
        onClick={handleExportToQueue}
        variant="default"
        size="sm"
        className="gap-2"
        disabled={!hasCredits || isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Film className="h-4 w-4" />
            Exportar Vídeo MP4
          </>
        )}
      </Button>
    </div>
  )
}
