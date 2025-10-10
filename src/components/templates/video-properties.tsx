"use client"

import * as React from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

export function VideoProperties() {
  const { selectedLayerId, design, updateLayer } = useTemplateEditor()

  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design.layers, selectedLayerId],
  )

  if (!selectedLayer || selectedLayer.type !== 'video') return null

  const metadata = selectedLayer.videoMetadata || {}

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
