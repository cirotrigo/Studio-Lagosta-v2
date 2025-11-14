"use client"

import * as React from 'react'
import { Download, Loader2, Film, AlertCircle, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useCredits } from '@/hooks/use-credits'
import {
  exportVideoWithLayers,
  checkVideoExportSupport,
  type VideoExportProgress,
} from '@/lib/konva/konva-video-export'
import { AudioSelectionModal, type AudioConfig } from '@/components/audio/audio-selection-modal'
import Konva from 'konva'
import { upload } from '@vercel/blob/client'

export function VideoExportButton() {
  const editorContext = useTemplateEditor()
  const { design, zoom, templateId, projectId } = editorContext
  const { toast } = useToast()
  const { canPerformOperation, getCost, refresh: refreshCredits, credits } = useCredits()

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
          const imageNode = stage.findOne(`#${videoLayer.id}`) as Konva.Image | null

          if (imageNode) {
            console.log('[Video Export] 🎯 Konva Image node encontrado:', videoLayer.id)

            // Pegar o elemento de vídeo HTML do Konva Image
            const videoElement = imageNode.image() as HTMLVideoElement

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

  // Verificar suporte do navegador
  const browserSupport = React.useMemo(() => checkVideoExportSupport(), [])

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

    // Buscar stage diretamente do Konva
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
    setExportProgress({ phase: 'preparing', progress: 0 })

    try {
      // 1. Chamar API para validar e deduzir créditos
      const validateResponse = await fetch('/api/export/video/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layerId: videoLayer.id,
        }),
      })

      if (!validateResponse.ok) {
        const error = await validateResponse.json()
        throw new Error(error.error || 'Falha ao validar créditos')
      }

      // 2. Exportar vídeo client-side
      const blob = await exportVideoWithLayers(
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
          format: exportFormat,
          quality: 0.8,
          audioConfig: audioConfig, // Pass audio configuration
        },
        (progress) => {
          setExportProgress(progress)
        }
      )

      // 3. Gerar thumbnail do primeiro frame do vídeo
      setExportProgress({ phase: 'finalizing', progress: 90 })
      console.log('[Video Export] Gerando thumbnail...')

      let thumbnailBlob: Blob | null = null
      try {
        // Criar vídeo temporário para capturar primeiro frame
        const videoUrl = URL.createObjectURL(blob)
        const videoEl = document.createElement('video')
        videoEl.src = videoUrl
        videoEl.muted = true

        await new Promise<void>((resolve, reject) => {
          videoEl.addEventListener('loadeddata', () => resolve(), { once: true })
          videoEl.addEventListener('error', () => reject(new Error('Falha ao carregar vídeo')), { once: true })
        })

        // Capturar primeiro frame
        const canvas = document.createElement('canvas')
        canvas.width = videoEl.videoWidth
        canvas.height = videoEl.videoHeight
        const ctx = canvas.getContext('2d')

        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
          thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar thumbnail'))),
              'image/jpeg',
              0.8
            )
          })
        }

        URL.revokeObjectURL(videoUrl)
        console.log('[Video Export] Thumbnail gerado:', thumbnailBlob?.size, 'bytes')
      } catch (error) {
        console.warn('[Video Export] Falha ao gerar thumbnail:', error)
        // Continuar sem thumbnail se falhar
      }

      // 4. Upload direto para Vercel Blob (evita limite de 413)
      setExportProgress({ phase: 'finalizing', progress: 90 })

      const fileName = `videos/${design.name || 'video'}-${Date.now()}.${exportFormat}`
      console.log('[Video Export] Iniciando upload direto para Vercel Blob...', fileName, blob.size, 'bytes')

      let videoUrl: string
      try {
        const videoUpload = await upload(fileName, blob, {
          access: 'public',
          contentType: blob.type,
          handleUploadUrl: '/api/export/video/upload-url',
          onUploadProgress: ({ percentage }) => {
            setExportProgress({
              phase: 'finalizing',
              progress: 90 + Math.min((percentage / 100) * 5, 5),
            })
          },
        })

        videoUrl = videoUpload.url
        console.log('[Video Export] Vídeo enviado para Vercel Blob:', videoUrl)
      } catch (uploadError) {
        console.error('[Video Export] Falha no upload do vídeo:', uploadError)
        throw new Error('Falha ao enviar o vídeo para o armazenamento')
      }

      // 4.3. Upload do thumbnail (se existe)
      let thumbnailUrl: string | undefined
      if (thumbnailBlob) {
        setExportProgress({ phase: 'finalizing', progress: 95 })
        const thumbnailFileName = fileName.replace(/\.[^/.]+$/, '_thumb.jpg')

        try {
          const thumbUpload = await upload(thumbnailFileName, thumbnailBlob, {
            access: 'public',
            contentType: 'image/jpeg',
            handleUploadUrl: '/api/export/video/upload-url',
            onUploadProgress: ({ percentage }) => {
              setExportProgress({
                phase: 'finalizing',
                progress: 95 + Math.min((percentage / 100) * 2, 2),
              })
            },
          })

          thumbnailUrl = thumbUpload.url
          console.log('[Video Export] Thumbnail enviado:', thumbnailUrl)
        } catch (thumbError) {
          console.warn('[Video Export] Falha ao enviar thumbnail. Continuando sem thumbnail.', thumbError)
        }
      }

      // 4.4. Registrar geração no banco de dados
      setExportProgress({ phase: 'finalizing', progress: 97 })

      const exportedDuration = audioConfig?.source === 'library'
        ? (audioConfig.endTime - audioConfig.startTime)
        : (videoDuration || videoLayer.videoMetadata?.duration || 10)

      const saveResponse = await fetch('/api/export/video/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          thumbnailUrl,
          templateId,
          projectId,
          fileName,
          duration: exportedDuration,
          fileSize: blob.size,
          format: exportFormat,
        }),
      })

      if (!saveResponse.ok) {
        const error = await saveResponse.json()
        throw new Error(error.error || 'Falha ao salvar vídeo')
      }

      const saveResult = await saveResponse.json()
      console.log('[Video Export] Vídeo salvo com sucesso:', saveResult.generation.id)

      // 4. Confirmar exportação e deduzir créditos
      try {
        const confirmResponse = await fetch('/api/export/video/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerId: videoLayer.id,
            duration: exportedDuration,
            fileSize: blob.size,
          }),
        })

        if (!confirmResponse.ok) {
          const error = await confirmResponse.json()
          console.warn('Falha ao confirmar exportação:', error)
        }
      } catch (confirmError) {
        console.error('Erro ao confirmar exportação:', confirmError)
      }

      // 5. Atualizar saldo de créditos
      await refreshCredits()

      toast({
        title: 'Vídeo exportado com sucesso!',
        description: `Vídeo disponível na aba Criativos. ${creditCost} créditos foram deduzidos.`,
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar Vídeo Final</DialogTitle>
            <DialogDescription>
              Esta ação irá gerar um vídeo completo com todas as camadas sobrepostas ao vídeo de
              fundo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Alerta de suporte do navegador */}
            {!browserSupport.supported && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Navegador não suportado</p>
                  <p className="text-xs text-muted-foreground">{browserSupport.message}</p>
                </div>
              </div>
            )}

            {/* Custo da exportação */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Custo da exportação</p>
                <p className="text-xs text-muted-foreground">
                  Será deduzido do seu saldo atual: {credits?.creditsRemaining || 0} créditos
                </p>
              </div>
              <div className="text-2xl font-bold">{creditCost} créditos</div>
            </div>

            {/* Seleção de formato */}
            <div className="space-y-3 rounded-lg border p-4">
              <Label className="text-sm font-medium">Formato de exportação</Label>
              <RadioGroup
                value={exportFormat}
                onValueChange={(value) => setExportFormat(value as 'webm' | 'mp4')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mp4" id="mp4" />
                  <Label htmlFor="mp4" className="flex flex-col cursor-pointer">
                    <span className="text-sm font-medium">MP4 (H.264)</span>
                    <span className="text-xs text-muted-foreground">
                      Recomendado - Compatível com iOS e redes sociais
                    </span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="webm" id="webm" />
                  <Label htmlFor="webm" className="flex flex-col cursor-pointer">
                    <span className="text-sm font-medium">WebM (VP9/VP8)</span>
                    <span className="text-xs text-muted-foreground">
                      Exportação mais rápida - Não funciona no iOS
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Configuração de Áudio */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Configuração de Áudio</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAudioModalOpen(true)}
                  className="gap-2"
                >
                  <Music className="h-4 w-4" />
                  Configurar
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Fonte: {
                  audioConfig.source === 'original' ? 'Áudio Original do Vídeo' :
                  audioConfig.source === 'library' ? 'Música da Biblioteca' :
                  'Sem Áudio (Mudo)'
                }</p>
                {audioConfig.source === 'library' && audioConfig.musicId && (
                  <p>• Volume: {audioConfig.volume}%</p>
                )}
              </div>
            </div>

            {/* Configurações */}
            <div className="space-y-2 rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Configurações:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Formato: {exportFormat.toUpperCase()} {exportFormat === 'mp4' ? '(H.264)' : '(VP9/VP8)'}</li>
                <li>• FPS: 30</li>
                <li>• Qualidade: Alta (0.8)</li>
                <li>
                  • Duração: {videoLayer?.videoMetadata?.duration?.toFixed(1) || 'Auto'}s
                </li>
                {exportFormat === 'mp4' && (
                  <li className="text-amber-600 dark:text-amber-500">
                    ⚠️ Conversão para MP4 pode levar mais tempo
                  </li>
                )}
              </ul>
            </div>

            {/* Progress bar durante exportação */}
            {isExporting && exportProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{getProgressText()}</span>
                  <span className="font-medium">{Math.round(exportProgress.progress)}%</span>
                </div>
                <Progress value={exportProgress.progress} className="h-2" />
              </div>
            )}

            {/* Alerta de créditos insuficientes */}
            {!hasCredits && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Créditos insuficientes</p>
                  <p className="text-xs text-muted-foreground">
                    Você precisa de pelo menos {creditCost} créditos para exportar este vídeo.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isExporting}>
              Cancelar
            </Button>
            <Button onClick={handleExport} disabled={!hasCredits || isExporting || !browserSupport.supported}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exportando...
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
