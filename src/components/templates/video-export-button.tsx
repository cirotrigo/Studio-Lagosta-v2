"use client"

import * as React from 'react'
import { Download, Loader2, Film, AlertCircle } from 'lucide-react'
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
import Konva from 'konva'

export function VideoExportButton() {
  const editorContext = useTemplateEditor()
  const { design, zoom } = editorContext
  const { toast } = useToast()
  const { canPerformOperation, getCost, refresh: refreshCredits, credits } = useCredits()

  const [isOpen, setIsOpen] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const [exportProgress, setExportProgress] = React.useState<VideoExportProgress | null>(null)
  const [exportFormat, setExportFormat] = React.useState<'webm' | 'mp4'>('mp4')

  // Refs para acessar selectedLayerIds e setZoom dentro da função de exportação
  const selectedLayerIdsRef = React.useRef<string[]>(editorContext.selectedLayerIds)
  const setZoomState = editorContext.setZoom
  const selectLayersFn = editorContext.selectLayers

  // Manter ref atualizada
  React.useEffect(() => {
    selectedLayerIdsRef.current = editorContext.selectedLayerIds
  }, [editorContext.selectedLayerIds])

  const videoLayer = design.layers.find((layer) => layer.type === 'video')
  const hasVideo = !!videoLayer

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
        throw new Error(_error.error || 'Falha ao validar créditos')
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
        },
        (progress) => {
          setExportProgress(progress)
        }
      )

      // 3. Confirmar exportação e deduzir créditos
      try {
        const confirmResponse = await fetch('/api/export/video/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerId: videoLayer.id,
            duration: videoLayer.videoMetadata?.duration || 10,
            fileSize: blob.size,
          }),
        })

        if (!confirmResponse.ok) {
          const error = await confirmResponse.json()
          console.warn('Falha ao confirmar exportação:', _error)
          // Continuar mesmo se a confirmação falhar (já temos o vídeo)
        }
      } catch (confirmError) {
        console.error('Erro ao confirmar exportação:', confirmError)
        // Não bloquear o download do vídeo por erro na confirmação
      }

      // 4. Download do vídeo
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${design.name || 'video'}-${Date.now()}.${exportFormat}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // 5. Atualizar saldo de créditos
      await refreshCredits()

      toast({
        title: 'Vídeo exportado com sucesso!',
        description: `${creditCost} créditos foram deduzidos do seu saldo.`,
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
    </>
  )
}
