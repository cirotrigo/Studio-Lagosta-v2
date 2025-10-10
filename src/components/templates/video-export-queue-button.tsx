"use client"

import * as React from 'react'
import { Film, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useCredits } from '@/hooks/use-credits'
import { exportVideoWithLayers } from '@/lib/konva/konva-video-export'
import Konva from 'konva'

export function VideoExportQueueButton() {
  const editorContext = useTemplateEditor()
  const { design, zoom, templateId, projectId } = editorContext
  const { toast } = useToast()
  const { canPerformOperation, getCost } = useCredits()

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

      // 2. Converter Blob para Base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(webmBlob)
      })

      // 3. Enviar para fila
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
          webmBlob: base64,
          designData: design,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Falha ao adicionar vídeo à fila')
      }

      const { jobId } = await response.json()

      // 4. Iniciar polling do status
      pollJobStatus(jobId)

      toast({
        title: 'Vídeo adicionado à fila! ✅',
        description: 'Você será notificado quando o vídeo estiver pronto. Continue trabalhando!',
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

  const pollJobStatus = (jobId: string) => {
    console.log('[VideoExportQueue] Iniciando polling para job:', jobId)
    let pollCount = 0
    const maxPolls = 60 // Máximo 5 minutos (60 * 5s)

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

        if (job.status === 'COMPLETED') {
          console.log('[VideoExportQueue] Job concluído! URL:', job.mp4ResultUrl)
          clearInterval(interval)

          toast({
            title: '🎉 Vídeo Pronto!',
            description: 'Seu vídeo MP4 está disponível na aba Criativos.',
            duration: 10000,
          })

          // Disparar evento para atualizar lista de criativos
          window.dispatchEvent(new CustomEvent('video-export-completed', { detail: { jobId, url: job.mp4ResultUrl } }))
        } else if (job.status === 'FAILED') {
          console.error('[VideoExportQueue] Job falhou:', job.errorMessage)
          clearInterval(interval)

          toast({
            variant: 'destructive',
            title: 'Erro no processamento',
            description: job.errorMessage || 'Falha ao processar vídeo',
          })
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
  )
}
