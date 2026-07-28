"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { GradientStop } from '@/types/template'

const MAX_STOPS = 6

const DEFAULT_STOPS: GradientStop[] = [
  { id: '1', color: '#000000', position: 0, opacity: 1 },
  { id: '2', color: '#000000', position: 1, opacity: 0 },
]

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace('#', '')
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('')
  }
  const num = Number.parseInt(value.slice(0, 6), 16)
  if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 }
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (channel: number) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function stopToRgba(stop: GradientStop): string {
  const { r, g, b } = hexToRgb(stop.color ?? '#000000')
  return `rgba(${r}, ${g}, ${b}, ${stop.opacity ?? 1})`
}

function stopsToCss(stops: GradientStop[]): string {
  return stops.map((stop) => `${stopToRgba(stop)} ${Math.round((stop.position ?? 0) * 100)}%`).join(', ')
}

/** Interpola cor e opacidade entre os stops vizinhos da posição dada. */
function interpolateStop(stops: GradientStop[], position: number): { color: string; opacity: number } {
  if (stops.length === 0) return { color: '#ffffff', opacity: 1 }
  const sorted = [...stops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const after = sorted.find((stop) => (stop.position ?? 0) >= position)
  const before = [...sorted].reverse().find((stop) => (stop.position ?? 0) <= position)
  if (!before) return { color: after!.color, opacity: after!.opacity ?? 1 }
  if (!after) return { color: before.color, opacity: before.opacity ?? 1 }
  const range = (after.position ?? 0) - (before.position ?? 0)
  const t = range <= 0 ? 0 : (position - (before.position ?? 0)) / range
  const c1 = hexToRgb(before.color ?? '#000000')
  const c2 = hexToRgb(after.color ?? '#000000')
  return {
    color: rgbToHex(c1.r + (c2.r - c1.r) * t, c1.g + (c2.g - c1.g) * t, c1.b + (c2.b - c1.b) * t),
    opacity: (before.opacity ?? 1) + ((after.opacity ?? 1) - (before.opacity ?? 1)) * t,
  }
}

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-conic-gradient(#d4d4d8 0% 25%, #ffffff 0% 50%)',
  backgroundSize: '12px 12px',
}

const RADIAL_POSITIONS: Array<{ x: number; y: number; label: string }> = [
  { x: 0, y: 0, label: 'Superior esquerdo' },
  { x: 0.5, y: 0, label: 'Superior centro' },
  { x: 1, y: 0, label: 'Superior direito' },
  { x: 0, y: 0.5, label: 'Esquerda' },
  { x: 0.5, y: 0.5, label: 'Centro' },
  { x: 1, y: 0.5, label: 'Direita' },
  { x: 0, y: 1, label: 'Inferior esquerdo' },
  { x: 0.5, y: 1, label: 'Inferior centro' },
  { x: 1, y: 1, label: 'Inferior direito' },
]

interface GradientEditorProps {
  layerId: string
}

/**
 * Editor unificado de gradientes — usado tanto no painel de propriedades
 * quanto no painel lateral "Gradientes", para manter os controles idênticos.
 */
export function GradientEditor({ layerId }: GradientEditorProps) {
  const { design, updateLayerStyle } = useTemplateEditor()
  const layer = React.useMemo(
    () => design.layers.find((item) => item.id === layerId) ?? null,
    [design.layers, layerId],
  )

  const rawStops = layer?.style?.gradientStops
  const stops = React.useMemo<GradientStop[]>(() => {
    const base = Array.isArray(rawStops) && rawStops.length > 0 ? rawStops : DEFAULT_STOPS
    return [...base].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [rawStops])

  const stopsRef = React.useRef(stops)
  stopsRef.current = stops

  const [selectedStopId, setSelectedStopId] = React.useState<string | null>(null)
  const selectedStop = stops.find((stop) => stop.id === selectedStopId) ?? stops[0]

  const barRef = React.useRef<HTMLDivElement | null>(null)
  const draggingIdRef = React.useRef<string | null>(null)

  const commitStops = React.useCallback(
    (next: GradientStop[]) => {
      updateLayerStyle(layerId, { gradientStops: next })
    },
    [layerId, updateLayerStyle],
  )

  const positionFromClientX = React.useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const handleStopPointerDown = React.useCallback(
    (event: React.PointerEvent, stopId: string) => {
      event.preventDefault()
      event.stopPropagation()
      setSelectedStopId(stopId)
      draggingIdRef.current = stopId
      const handleMove = (moveEvent: PointerEvent) => {
        const id = draggingIdRef.current
        if (!id) return
        const position = positionFromClientX(moveEvent.clientX)
        commitStops(stopsRef.current.map((stop) => (stop.id === id ? { ...stop, position } : stop)))
      }
      const handleUp = () => {
        draggingIdRef.current = null
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [commitStops, positionFromClientX],
  )

  const handleBarPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      if (stopsRef.current.length >= MAX_STOPS) return
      const position = positionFromClientX(event.clientX)
      const interpolated = interpolateStop(stopsRef.current, position)
      const newStop: GradientStop = { id: `stop-${Date.now()}`, position, ...interpolated }
      commitStops([...stopsRef.current, newStop])
      setSelectedStopId(newStop.id)
    },
    [commitStops, positionFromClientX],
  )

  if (!layer) return null

  const gradientType = (layer.style?.gradientType as 'linear' | 'radial') ?? 'linear'
  const angle = Math.round(layer.style?.gradientAngle ?? 180)
  const centerX = layer.style?.gradientCenterX ?? 0.5
  const centerY = layer.style?.gradientCenterY ?? 0.5
  const radiusScale = layer.style?.gradientRadiusScale ?? 1

  const cssStops = stopsToCss(stops)
  const previewBackground =
    gradientType === 'linear'
      ? `linear-gradient(${angle}deg, ${cssStops})`
      : `radial-gradient(circle at ${centerX * 100}% ${centerY * 100}%, ${cssStops})`

  const hasCustomSpan =
    typeof layer.style?.gradientStartX === 'number' &&
    typeof layer.style?.gradientStartY === 'number' &&
    typeof layer.style?.gradientEndX === 'number' &&
    typeof layer.style?.gradientEndY === 'number'

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

  /**
   * Ajusta a direção do linear. Com segmento customizado (área de aplicação),
   * gira o segmento em torno do próprio centro preservando o comprimento;
   * sem ele, apenas grava o ângulo (eixo cobre a layer inteira).
   */
  const setLinearAngle = (nextAngle: number) => {
    if (!hasCustomSpan) {
      updateLayerStyle(layerId, { gradientAngle: nextAngle })
      return
    }
    const width = Math.max(20, layer.size?.width ?? 0)
    const height = Math.max(20, layer.size?.height ?? 0)
    const sx = (layer.style?.gradientStartX ?? 0) * width
    const sy = (layer.style?.gradientStartY ?? 0) * height
    const ex = (layer.style?.gradientEndX ?? 1) * width
    const ey = (layer.style?.gradientEndY ?? 1) * height
    const midX = (sx + ex) / 2
    const midY = (sy + ey) / 2
    const halfLength = Math.hypot(ex - sx, ey - sy) / 2
    const theta = ((180 - nextAngle) / 180) * Math.PI
    const dx = Math.sin(theta) * halfLength
    const dy = Math.cos(theta) * halfLength
    updateLayerStyle(layerId, {
      gradientAngle: nextAngle,
      gradientStartX: clamp01((midX - dx) / width),
      gradientStartY: clamp01((midY - dy) / height),
      gradientEndX: clamp01((midX + dx) / width),
      gradientEndY: clamp01((midY + dy) / height),
    })
  }

  const resetLinearSpan = () => {
    updateLayerStyle(layerId, {
      gradientStartX: undefined,
      gradientStartY: undefined,
      gradientEndX: undefined,
      gradientEndY: undefined,
    })
  }

  const setType = (value: 'linear' | 'radial') => {
    if (value === gradientType) return
    updateLayerStyle(layerId, {
      gradientType: value,
      gradientAngle: value === 'linear' ? (layer.style?.gradientAngle ?? 180) : layer.style?.gradientAngle,
    })
  }

  const updateSelectedStop = (patch: Partial<GradientStop>) => {
    if (!selectedStop) return
    commitStops(stops.map((stop) => (stop.id === selectedStop.id ? { ...stop, ...patch } : stop)))
  }

  const removeSelectedStop = () => {
    if (!selectedStop || stops.length <= 2) return
    commitStops(stops.filter((stop) => stop.id !== selectedStop.id))
    setSelectedStopId(null)
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Preview + tipo */}
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/40" style={CHECKERBOARD_STYLE}>
          <div className="h-full w-full" style={{ background: previewBackground }} />
        </div>
        <div className="flex flex-1 rounded-md border border-border/40 p-0.5">
          <button
            type="button"
            onClick={() => setType('linear')}
            className={cn(
              'flex-1 rounded-[5px] px-2 py-1.5 text-[11px] font-medium transition',
              gradientType === 'linear' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Linear
          </button>
          <button
            type="button"
            onClick={() => setType('radial')}
            className={cn(
              'flex-1 rounded-[5px] px-2 py-1.5 text-[11px] font-medium transition',
              gradientType === 'radial' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Radial
          </button>
        </div>
      </div>

      {/* Barra de stops */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wide">Cores</Label>
          <span className="text-[10px] text-muted-foreground">
            {stops.length < MAX_STOPS ? 'Clique na barra para adicionar' : `Máx. ${MAX_STOPS} pontos`}
          </span>
        </div>
        <div className="px-1.5 pb-2">
          <div
            ref={barRef}
            onPointerDown={handleBarPointerDown}
            className="relative h-7 cursor-copy rounded-md border border-border/40"
            style={CHECKERBOARD_STYLE}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[5px]"
              style={{ background: `linear-gradient(90deg, ${cssStops})` }}
            />
            {stops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                aria-label={`Ponto de cor em ${Math.round((stop.position ?? 0) * 100)}%`}
                onPointerDown={(event) => handleStopPointerDown(event, stop.id)}
                className={cn(
                  'absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-md transition-transform active:cursor-grabbing',
                  selectedStop?.id === stop.id
                    ? 'z-10 scale-110 border-primary ring-2 ring-primary/30'
                    : 'border-white',
                )}
                style={{ left: `${(stop.position ?? 0) * 100}%`, backgroundColor: stop.color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Edição do stop selecionado */}
      {selectedStop && (
        <div className="space-y-2 rounded-md border border-border/40 bg-card/60 p-2.5">
          <div className="flex items-center gap-2">
            <input
              aria-label="Cor do ponto selecionado"
              type="color"
              className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border/40"
              value={selectedStop.color}
              onChange={(event) => updateSelectedStop({ color: event.target.value })}
            />
            <Input
              className="h-8 flex-1 text-xs uppercase"
              value={selectedStop.color}
              onChange={(event) => updateSelectedStop({ color: event.target.value.trim() })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={removeSelectedStop}
              disabled={stops.length <= 2}
              aria-label="Remover ponto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide">
              Opacidade: {Math.round((selectedStop.opacity ?? 1) * 100)}%
            </Label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((selectedStop.opacity ?? 1) * 100)}
              onChange={(event) => updateSelectedStop({ opacity: Number(event.target.value) / 100 })}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Controles específicos do tipo */}
      {gradientType === 'linear' ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide" htmlFor="gradient-angle">
              Direção: {angle}°
            </Label>
            <input
              id="gradient-angle"
              type="range"
              min={0}
              max={360}
              value={angle}
              onChange={(event) => setLinearAngle(Math.max(0, Math.min(360, Number(event.target.value))))}
              className="w-full"
            />
          </div>
          {hasCustomSpan && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/30 px-2.5 py-2">
              <span className="text-[10px] leading-snug text-muted-foreground">
                Área ajustada pelas bolinhas no canvas
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-[10px]"
                onClick={resetLinearSpan}
              >
                Preencher camada
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide">Posição do centro</Label>
            <div className="grid w-fit grid-cols-3 gap-1 rounded-md border border-border/40 bg-muted/30 p-1">
              {RADIAL_POSITIONS.map((pos) => {
                const active = Math.abs(centerX - pos.x) < 0.01 && Math.abs(centerY - pos.y) < 0.01
                return (
                  <button
                    key={pos.label}
                    type="button"
                    title={pos.label}
                    aria-label={pos.label}
                    onClick={() =>
                      updateLayerStyle(layerId, { gradientCenterX: pos.x, gradientCenterY: pos.y })
                    }
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded transition',
                      active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        active ? 'bg-primary-foreground' : 'bg-muted-foreground/60',
                      )}
                    />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide" htmlFor="gradient-center-x">
              Horizontal: {Math.round(centerX * 100)}%
            </Label>
            <input
              id="gradient-center-x"
              type="range"
              min={0}
              max={100}
              value={Math.round(centerX * 100)}
              onChange={(event) =>
                updateLayerStyle(layerId, { gradientCenterX: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide" htmlFor="gradient-center-y">
              Vertical: {Math.round(centerY * 100)}%
            </Label>
            <input
              id="gradient-center-y"
              type="range"
              min={0}
              max={100}
              value={Math.round(centerY * 100)}
              onChange={(event) =>
                updateLayerStyle(layerId, { gradientCenterY: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide" htmlFor="gradient-radius">
              Tamanho: {Math.round(radiusScale * 100)}%
            </Label>
            <input
              id="gradient-radius"
              type="range"
              min={20}
              max={200}
              value={Math.round(radiusScale * 100)}
              onChange={(event) =>
                updateLayerStyle(layerId, { gradientRadiusScale: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}
