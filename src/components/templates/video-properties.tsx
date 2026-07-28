"use client"

import * as React from 'react'
import { AlertTriangle, Camera, Loader2, Music, Play, Pause, Scissors, Volume2, VolumeX } from 'lucide-react'
import Konva from 'konva'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { useToast } from '@/hooks/use-toast'

const formatSeconds = (value: number) => {
  const mins = Math.floor(value / 60)
  const secs = value - mins * 60
  return mins > 0 ? `${mins}m${secs.toFixed(1)}s` : `${secs.toFixed(1)}s`
}

/** Localiza o <video> DOM da camada dentro dos stages Konva montados. */
function findLayerVideoElement(layerId: string): HTMLVideoElement | null {
  for (const stage of Konva.stages) {
    const node = stage.findOne(`#${layerId}`)
    if (node instanceof Konva.Image) {
      const el = node.image()
      if (el && (el as HTMLVideoElement).tagName === 'VIDEO') {
        return el as HTMLVideoElement
      }
    }
  }
  return null
}

export function VideoProperties() {
  const { selectedLayerId, design, updateLayer } = useTemplateEditor()
  const { toast } = useToast()
  const { upload: uploadToBlob, isUploading: isUploadingPoster } = useBlobUpload()

  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design.layers, selectedLayerId],
  )

  const pageAudio = design.audio ?? null

  if (!selectedLayer || selectedLayer.type !== 'video') return null

  const metadata = selectedLayer.videoMetadata || {}
  const fullDuration = metadata.duration && metadata.duration > 0 ? metadata.duration : null
  const trimStart = metadata.trimStart ?? 0
  const trimEnd = metadata.trimEnd ?? fullDuration ?? 0
  const trimmedDuration = fullDuration ? Math.max(0, trimEnd - trimStart) : null
  // Duração efetiva do export: trim ∧ trecho da música (mesma regra do export)
  const musicSliceDuration =
    pageAudio && (pageAudio.source === 'library' || pageAudio.source === 'mix') && pageAudio.musicId
      ? Math.max(0, pageAudio.endTime - pageAudio.startTime)
      : null
  const effectiveDuration =
    trimmedDuration !== null && musicSliceDuration !== null
      ? Math.min(trimmedDuration, musicSliceDuration)
      : trimmedDuration ?? musicSliceDuration

  const handleTogglePlay = () => {
    // Dispatch custom event to control video playback
    window.dispatchEvent(
      new CustomEvent('video-control', {
        detail: {
          layerId: selectedLayer.id,
          action: metadata.autoplay ? 'pause' : 'play',
        },
      }),
    )

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      videoMetadata: {
        ...metadata,
        autoplay: !metadata.autoplay,
      },
    }))
  }

  const handleToggleMute = () => {
    window.dispatchEvent(
      new CustomEvent('video-control', {
        detail: {
          layerId: selectedLayer.id,
          action: 'mute',
          value: !metadata.muted,
        },
      }),
    )

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      videoMetadata: {
        ...metadata,
        muted: !metadata.muted,
      },
    }))
  }

  const handleToggleLoop = () => {
    window.dispatchEvent(
      new CustomEvent('video-control', {
        detail: {
          layerId: selectedLayer.id,
          action: 'loop',
          value: !metadata.loop,
        },
      }),
    )

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      videoMetadata: {
        ...metadata,
        loop: !metadata.loop,
      },
    }))
  }

  const handlePlaybackRateChange = (value: number[]) => {
    const newRate = value[0]

    window.dispatchEvent(
      new CustomEvent('video-control', {
        detail: {
          layerId: selectedLayer.id,
          action: 'playbackRate',
          value: newRate,
        },
      }),
    )

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      videoMetadata: {
        ...metadata,
        playbackRate: newRate,
      },
    }))
  }

  const handleObjectFitChange = (fit: 'cover' | 'contain' | 'fill') => {
    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      videoMetadata: {
        ...metadata,
        objectFit: fit,
      },
    }))
  }

  const handleTrimChange = (values: number[]) => {
    if (!fullDuration) return
    const [start, rawEnd] = values
    const end = Math.max(start + 0.5, rawEnd) // trecho mínimo de 0,5s
    // Reposiciona o preview no início do trecho para o usuário ver o corte
    window.dispatchEvent(
      new CustomEvent('video-control', {
        detail: { layerId: selectedLayer.id, action: 'seek', value: start },
      }),
    )
    updateLayer(
      selectedLayer.id,
      (layer) => ({
        ...layer,
        videoMetadata: {
          ...metadata,
          trimStart: Math.max(0, Math.round(start * 10) / 10),
          // trimEnd no fim do vídeo = sem corte (undefined)
          trimEnd: end >= fullDuration - 0.05 ? undefined : Math.round(end * 10) / 10,
        },
      }),
      { coalesceKey: `video-trim:${selectedLayer.id}` },
    )
  }

  const handleSeekPreview = (values: number[]) => {
    window.dispatchEvent(
      new CustomEvent('video-control', {
        detail: { layerId: selectedLayer.id, action: 'seek', value: values[0] },
      }),
    )
  }

  const handleCapturePoster = async () => {
    const video = findLayerVideoElement(selectedLayer.id)
    if (!video || !video.videoWidth) {
      toast({
        variant: 'destructive',
        description: 'Vídeo ainda não carregou — tente novamente em instantes.',
      })
      return
    }
    try {
      video.pause()
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D indisponível')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85),
      )
      if (!blob) throw new Error('Falha ao capturar o frame')
      const file = new File([blob], `poster-${selectedLayer.id}.jpg`, { type: 'image/jpeg' })
      const posterUrl = await uploadToBlob(file)
      updateLayer(selectedLayer.id, (layer) => ({
        ...layer,
        videoMetadata: { ...metadata, posterUrl },
      }))
      toast({ title: 'Capa definida', description: 'O frame atual virou a capa do vídeo.' })
    } catch (error) {
      console.error('[VideoProperties] Falha ao capturar poster:', error)
      toast({
        variant: 'destructive',
        description: error instanceof Error ? error.message : 'Falha ao capturar a capa.',
      })
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-border/30 bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Controles de Vídeo</span>
        <span className="rounded-full bg-primary/10 px-2 py-[2px] text-[10px] font-semibold uppercase text-primary">
          Video
        </span>
      </div>

      {/* Play/Pause */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide">Reprodução</Label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTogglePlay}
            className="flex-1 gap-2"
          >
            {metadata.autoplay ? (
              <>
                <Pause className="h-4 w-4" />
                Pausar
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Reproduzir
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleMute}
            className="px-3"
          >
            {metadata.muted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      {/* Loop */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-[11px] uppercase tracking-wide">Loop Contínuo</Label>
          <p className="text-[10px] text-muted-foreground">Repetir vídeo automaticamente</p>
        </div>
        <Switch
          checked={metadata.loop ?? true}
          onCheckedChange={handleToggleLoop}
        />
      </div>

      <Separator className="my-3" />

      {/* Velocidade */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wide">Velocidade de Reprodução</Label>
          <span className="text-sm font-medium text-muted-foreground">
            {(metadata.playbackRate || 1).toFixed(2)}x
          </span>
        </div>
        <Slider
          value={[metadata.playbackRate || 1]}
          onValueChange={handlePlaybackRateChange}
          min={0.25}
          max={2}
          step={0.25}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0.25x</span>
          <span>1x</span>
          <span>2x</span>
        </div>
      </div>

      <Separator className="my-3" />

      {/* Trim do vídeo */}
      {fullDuration ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
              <Scissors className="h-3.5 w-3.5" />
              Trecho do vídeo
            </Label>
            <span className="text-[11px] font-medium text-muted-foreground">
              {formatSeconds(trimStart)} → {formatSeconds(trimEnd)}
            </span>
          </div>
          <Slider
            value={[trimStart, trimEnd]}
            onValueChange={handleTrimChange}
            min={0}
            max={fullDuration}
            step={0.1}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Editor e export reproduzem apenas o trecho selecionado
          </p>
        </div>
      ) : null}

      {/* Duração efetiva + limite do Instagram */}
      {effectiveDuration !== null && (
        <div className="rounded-md bg-muted/50 p-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duração do export:</span>
            <span className="font-semibold">{formatSeconds(effectiveDuration)}</span>
          </div>
          {musicSliceDuration !== null && trimmedDuration !== null && musicSliceDuration < trimmedDuration && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Limitada pelo trecho da música ({formatSeconds(musicSliceDuration)})
            </p>
          )}
          {effectiveDuration > 60 && (
            <p className="mt-1 flex items-start gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Story de vídeo no Instagram aceita até 60s{effectiveDuration > 90 ? '; Reel via Zernio, até 90s' : ' (Reel aceita até 90s)'}
            </p>
          )}
        </div>
      )}

      <Separator className="my-3" />

      {/* Posição do preview + capa */}
      {fullDuration ? (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide">Capa do vídeo</Label>
          <Slider
            defaultValue={[trimStart]}
            onValueChange={handleSeekPreview}
            min={trimStart}
            max={trimEnd}
            step={0.1}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Arraste para escolher o frame e capture como capa
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-xs"
              onClick={handleCapturePoster}
              disabled={isUploadingPoster}
            >
              {isUploadingPoster ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              Usar frame atual como capa
            </Button>
            {metadata.posterUrl && (
              <img
                src={metadata.posterUrl}
                alt="Capa do vídeo"
                className="h-9 w-9 rounded border border-border/40 object-cover"
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Trilha da página (aba Músicas) */}
      {pageAudio?.musicId ? (
        <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/40 p-2 text-[11px]">
          <Music className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            Trilha: <span className="font-medium">{pageAudio.musicName ?? 'Música da página'}</span>
            {pageAudio.source === 'mix' ? ' (mix com áudio do vídeo)' : ' (áudio do vídeo substituído)'}
          </span>
        </div>
      ) : null}

      <Separator className="my-3" />

      {/* Object Fit */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide">Ajuste no Frame</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'cover' as const, label: 'Cover', description: 'Preencher' },
            { value: 'contain' as const, label: 'Contain', description: 'Ajustar' },
            { value: 'fill' as const, label: 'Fill', description: 'Esticar' },
          ].map((fit) => {
            const isActive = (metadata.objectFit ?? 'cover') === fit.value
            return (
              <button
                key={fit.value}
                type="button"
                onClick={() => handleObjectFitChange(fit.value)}
                className={`
                  rounded-md border px-3 py-2 text-[11px] font-semibold transition-all
                  ${isActive
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border/40 bg-card hover:bg-accent hover:text-accent-foreground'
                  }
                `}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>{fit.label}</span>
                  <span className="text-[9px] font-normal text-muted-foreground">
                    {fit.description}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Define como o vídeo se ajusta ao tamanho da camada
        </p>
      </div>

      {/* Video Info */}
      {metadata.duration && (
        <>
          <Separator className="my-3" />
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide">Informações</Label>
            <div className="rounded-md bg-muted/50 p-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duração:</span>
                <span className="font-medium">{metadata.duration.toFixed(2)}s</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
