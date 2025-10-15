"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GRADIENTS_LIBRARY } from '@/lib/assets/gradients-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import type { GradientStop } from '@/types/template'

export function GradientsPanel() {
  const { addLayer, design, selectedLayerId } = useTemplateEditor()

  // Verifica se há uma layer de gradiente selecionada
  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId && (layer.type === 'gradient' || layer.type === 'gradient2')),
    [design.layers, selectedLayerId]
  )

  const handleAddGradient = React.useCallback(
    (gradientId: string) => {
      const definition = GRADIENTS_LIBRARY.find((item) => item.id === gradientId)
      if (!definition) return

      const base = createDefaultLayer('gradient')
      addLayer({
        ...base,
        name: `Gradiente - ${definition.label}`,
        position: { x: 0, y: 0 },
        size: { width: design.canvas.width, height: design.canvas.height },
        style: {
          ...base.style,
          gradientType: definition.gradientType,
          gradientAngle: definition.gradientAngle,
          gradientStops: definition.gradientStops,
        },
      })
    },
    [addLayer, design.canvas.width, design.canvas.height],
  )

  return (
    <div className="space-y-4">
      {/* Controles de edição (se houver gradiente selecionado) */}
      {selectedLayer && (
        <GradientControls
          layerId={selectedLayer.id}
          layer={selectedLayer}
        />
      )}

      {/* Templates pré-definidos */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Templates de Gradientes</h3>
          <p className="text-xs text-muted-foreground">Clique para adicionar ao canvas (tamanho completo)</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {GRADIENTS_LIBRARY.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              onClick={() => handleAddGradient(gradient.id)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border/40 bg-muted/40 p-3 transition hover:border-primary hover:shadow-md"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-white">
                <GradientPreview gradient={gradient} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{gradient.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface GradientControlsProps {
  layerId: string
  layer: { style?: { gradientType?: 'linear' | 'radial'; gradientAngle?: number; gradientStops?: GradientStop[] } }
}

function GradientControls({ layerId, layer }: GradientControlsProps) {
  const { updateLayerStyle } = useTemplateEditor()

  const stops = layer.style?.gradientStops ?? [
    { id: '1', color: '#000000', position: 0, opacity: 1 },
    { id: '2', color: '#000000', position: 1, opacity: 0 },
  ]

  const handleGradientTypeChange = (value: 'linear' | 'radial') => {
    updateLayerStyle(layerId, {
      gradientType: value,
      gradientAngle: value === 'linear' ? layer.style?.gradientAngle ?? 180 : undefined,
    })
  }

  const handleAngleChange = (value: number) => {
    updateLayerStyle(layerId, {
      gradientAngle: Math.max(0, Math.min(360, value)),
    })
  }

  const updateStop = (index: number, update: Partial<GradientStop>) => {
    const nextStops = stops.map((stop, idx) => (idx === index ? { ...stop, ...update } : stop))
    updateLayerStyle(layerId, { gradientStops: nextStops })
  }

  const addStop = () => {
    const last = stops[stops.length - 1]
    const nextPosition = Math.min(1, (last?.position ?? 1) + 0.1)
    const nextStops = [...stops, { id: Date.now().toString(), color: '#FFFFFF', position: nextPosition, opacity: 1 }]
    updateLayerStyle(layerId, { gradientStops: nextStops })
  }

  const removeStop = (index: number) => {
    if (stops.length <= 2) return
    const nextStops = stops.filter((_, idx) => idx !== index)
    updateLayerStyle(layerId, { gradientStops: nextStops })
  }

  return (
    <div className="space-y-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-primary">Editar Gradiente Selecionado</h3>
        <p className="text-xs text-muted-foreground">Ajuste as propriedades do gradiente</p>
      </div>

      {/* Tipo de Gradiente */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide">Tipo</Label>
        <Select
          value={(layer.style?.gradientType as 'linear' | 'radial') ?? 'linear'}
          onValueChange={(value) => handleGradientTypeChange(value as 'linear' | 'radial')}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="radial">Radial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ângulo (apenas para linear) */}
      {(layer.style?.gradientType ?? 'linear') === 'linear' && (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide" htmlFor="gradient-angle">
            Ângulo: {Math.round(layer.style?.gradientAngle ?? 180)}°
          </Label>
          <input
            id="gradient-angle"
            type="range"
            min={0}
            max={360}
            value={Math.round(layer.style?.gradientAngle ?? 180)}
            onChange={(event) => handleAngleChange(Number(event.target.value))}
            className="w-full"
          />
        </div>
      )}

      {/* Paradas de Cor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wide">Cores</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStop} disabled={stops.length >= 6}>
            + Adicionar
          </Button>
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2 pr-2">
            {stops.map((stop, index) => (
              <div key={stop.id || index} className="rounded-md border border-border/40 bg-card p-3">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Cor ${index + 1}`}
                    type="color"
                    className="h-9 w-9 rounded border border-border/40"
                    value={stop.color}
                    onChange={(event) => updateStop(index, { color: event.target.value })}
                  />
                  <Input
                    className="h-9 flex-1 text-xs"
                    value={stop.color}
                    onChange={(event) => updateStop(index, { color: event.target.value })}
                  />
                  {stops.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStop(index)}
                      className="h-9 px-2"
                    >
                      ✕
                    </Button>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-wide">
                      Posição: {Math.round((stop.position ?? 0) * 100)}%
                    </Label>
                    <Label className="text-[10px] uppercase tracking-wide">
                      Opacidade: {Math.round((stop.opacity ?? 1) * 100)}%
                    </Label>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((stop.position ?? 0) * 100)}
                    onChange={(event) => updateStop(index, { position: Number(event.target.value) / 100 })}
                    className="w-full"
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((stop.opacity ?? 1) * 100)}
                    onChange={(event) => updateStop(index, { opacity: Number(event.target.value) / 100 })}
                    className="w-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

interface GradientPreviewProps {
  gradient: typeof GRADIENTS_LIBRARY[0]
}

function GradientPreview({ gradient }: GradientPreviewProps) {
  const stops = gradient.gradientStops
    .sort((a, b) => a.position - b.position)
    .map((stop) => {
      const r = parseInt(stop.color.slice(1, 3), 16)
      const g = parseInt(stop.color.slice(3, 5), 16)
      const b = parseInt(stop.color.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${stop.opacity}) ${stop.position * 100}%`
    })
    .join(', ')

  const gradientStyle =
    gradient.gradientType === 'linear'
      ? `linear-gradient(${gradient.gradientAngle}deg, ${stops})`
      : `radial-gradient(circle, ${stops})`

  return (
    <div
      className="h-full w-full"
      style={{
        background: gradientStyle,
      }}
    />
  )
}
