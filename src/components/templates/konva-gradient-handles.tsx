"use client"

import * as React from 'react'
import Konva from 'konva'
import { Circle, Group, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer } from '@/types/template'
import { resolveLinearGradientPoints } from './konva-layer-factory'

/**
 * KonvaGradientHandles - Handles arrastáveis para editar gradientes
 * diretamente no canvas (estilo Figma).
 *
 * - Radial: uma bolinha no centro do gradiente; arrastar atualiza
 *   gradientCenterX/Y (0..1 relativos à layer).
 * - Linear: duas bolinhas nas extremidades do eixo do gradiente, ligadas
 *   por uma linha tracejada; arrastar qualquer uma gira gradientAngle.
 *
 * Os mesmos campos são usados pelos sliders do painel e pelo export,
 * então canvas e painel ficam sempre sincronizados.
 */

interface KonvaGradientHandlesProps {
  stageRef: React.RefObject<Konva.Stage | null>
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const HANDLE_COLOR = 'hsl(217, 91%, 60%)'

export function KonvaGradientHandles({ stageRef }: KonvaGradientHandlesProps) {
  const { design, selectedLayerIds, zoom, updateLayerStyle } = useTemplateEditor()

  const layer =
    selectedLayerIds.length === 1
      ? design.layers.find((item) => item.id === selectedLayerIds[0])
      : undefined

  const isGradient =
    !!layer &&
    (layer.type === 'gradient' || layer.type === 'gradient2') &&
    layer.visible !== false &&
    !layer.locked

  if (!isGradient || !layer) return null

  if (layer.style?.gradientType === 'radial') {
    return (
      <RadialHandle
        key={layer.id}
        layer={layer}
        zoom={zoom}
        stageRef={stageRef}
        updateLayerStyle={updateLayerStyle}
      />
    )
  }

  return (
    <LinearHandles
      key={layer.id}
      layer={layer}
      zoom={zoom}
      stageRef={stageRef}
      updateLayerStyle={updateLayerStyle}
    />
  )
}

interface HandleProps {
  layer: Layer
  zoom: number
  stageRef: React.RefObject<Konva.Stage | null>
  updateLayerStyle: (layerId: string, style: Partial<Layer['style']>) => void
}

/** Transformações local ↔ canvas respeitando a rotação da layer */
function useLayerTransform(layer: Layer) {
  const rotationRad = ((layer.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)
  const layerX = layer.position?.x ?? 0
  const layerY = layer.position?.y ?? 0

  const localToCanvas = React.useCallback(
    (lx: number, ly: number) => ({
      x: layerX + lx * cos - ly * sin,
      y: layerY + lx * sin + ly * cos,
    }),
    [layerX, layerY, cos, sin],
  )

  const canvasToLocal = React.useCallback(
    (px: number, py: number) => {
      const dx = px - layerX
      const dy = py - layerY
      return {
        x: dx * cos + dy * sin,
        y: -dx * sin + dy * cos,
      }
    },
    [layerX, layerY, cos, sin],
  )

  return { localToCanvas, canvasToLocal }
}

/** Agenda updates de estilo com requestAnimationFrame para arraste fluido */
function useRafStyleUpdate(
  layerId: string,
  updateLayerStyle: HandleProps['updateLayerStyle'],
) {
  const rafRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return React.useCallback(
    (style: Partial<Layer['style']>, commit: boolean) => {
      if (commit) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        updateLayerStyle(layerId, style)
        return
      }
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        updateLayerStyle(layerId, style)
      })
    },
    [layerId, updateLayerStyle],
  )
}

function useStageCursor(stageRef: React.RefObject<Konva.Stage | null>) {
  return React.useCallback(
    (cursor: string) => {
      const container = stageRef.current?.container()
      if (container) container.style.cursor = cursor
    },
    [stageRef],
  )
}

/** Bolinha branca com anel azul — visual compartilhado dos handles */
function HandleDot({
  scale,
  filled,
}: {
  scale: number
  filled: boolean
}) {
  return (
    <>
      {/* Área de toque maior (invisível) para facilitar em mobile */}
      <Circle radius={16 / scale} fill="transparent" />
      <Circle
        radius={9 / scale}
        fill="rgba(255, 255, 255, 0.95)"
        stroke={HANDLE_COLOR}
        strokeWidth={1.5 / scale}
        shadowColor="black"
        shadowBlur={4 / scale}
        shadowOpacity={0.3}
      />
      {filled && <Circle radius={3 / scale} fill={HANDLE_COLOR} />}
    </>
  )
}

function RadialHandle({ layer, zoom, stageRef, updateLayerStyle }: HandleProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const { localToCanvas, canvasToLocal } = useLayerTransform(layer)
  const scheduleUpdate = useRafStyleUpdate(layer.id, updateLayerStyle)
  const setCursor = useStageCursor(stageRef)

  // Mesmas dimensões mínimas usadas pelo GradientNode
  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)
  const centerX = layer.style?.gradientCenterX ?? 0.5
  const centerY = layer.style?.gradientCenterY ?? 0.5
  const radiusScale = layer.style?.gradientRadiusScale ?? 1
  const gradientRadius = (Math.max(width, height) / 2) * radiusScale

  const handlePos = localToCanvas(width * centerX, height * centerY)
  const scale = Math.max(zoom, 0.01)

  const applyDragPosition = React.useCallback(
    (node: Konva.Node, commit: boolean) => {
      const local = canvasToLocal(node.x(), node.y())
      const nextCenterX = clamp01(local.x / width)
      const nextCenterY = clamp01(local.y / height)

      // Mantém o handle dentro dos limites da layer
      const clamped = localToCanvas(width * nextCenterX, height * nextCenterY)
      node.position(clamped)

      scheduleUpdate(
        { gradientCenterX: nextCenterX, gradientCenterY: nextCenterY },
        commit,
      )
    },
    [canvasToLocal, localToCanvas, width, height, scheduleUpdate],
  )

  return (
    <>
      {/* Anel tracejado mostrando o alcance do gradiente durante o arraste */}
      {isDragging && (
        <Circle
          x={handlePos.x}
          y={handlePos.y}
          radius={gradientRadius}
          stroke={HANDLE_COLOR}
          strokeWidth={1.5 / scale}
          dash={[6 / scale, 4 / scale]}
          opacity={0.7}
          listening={false}
        />
      )}

      <Group
        x={handlePos.x}
        y={handlePos.y}
        draggable
        onDragStart={() => setIsDragging(true)}
        onDragMove={(event) => applyDragPosition(event.target, false)}
        onDragEnd={(event) => {
          setIsDragging(false)
          applyDragPosition(event.target, true)
        }}
        onMouseEnter={() => setCursor('move')}
        onMouseLeave={() => setCursor('default')}
      >
        <HandleDot scale={scale} filled />
      </Group>
    </>
  )
}

function LinearHandles({ layer, zoom, stageRef, updateLayerStyle }: HandleProps) {
  const { localToCanvas, canvasToLocal } = useLayerTransform(layer)
  const scheduleUpdate = useRafStyleUpdate(layer.id, updateLayerStyle)
  const setCursor = useStageCursor(stageRef)

  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)

  // Segmento efetivo: customizado (área de aplicação) ou derivado do ângulo
  const { start, end } = resolveLinearGradientPoints(layer.style, width, height)
  const startPos = localToCanvas(start.x, start.y)
  const endPos = localToCanvas(end.x, end.y)
  const scale = Math.max(zoom, 0.01)

  const applyDrag = React.useCallback(
    (node: Konva.Node, kind: 'start' | 'end', commit: boolean) => {
      const local = canvasToLocal(node.x(), node.y())
      const relX = clamp01(local.x / width)
      const relY = clamp01(local.y / height)

      // Mantém o handle dentro dos limites da layer
      node.position(localToCanvas(width * relX, height * relY))

      const current = resolveLinearGradientPoints(layer.style, width, height)
      const startRel =
        kind === 'start'
          ? { x: relX, y: relY }
          : { x: current.start.x / width, y: current.start.y / height }
      const endRel =
        kind === 'end'
          ? { x: relX, y: relY }
          : { x: current.end.x / width, y: current.end.y / height }

      // Mantém gradientAngle coerente com o segmento (usado por previews CSS
      // e como fallback em layers sem segmento customizado)
      const dx = (endRel.x - startRel.x) * width
      const dy = (endRel.y - startRel.y) * height
      const cssAngle =
        Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001
          ? undefined
          : Math.round((((180 - (Math.atan2(dx, dy) * 180) / Math.PI) % 360) + 360) % 360)

      scheduleUpdate(
        {
          gradientStartX: startRel.x,
          gradientStartY: startRel.y,
          gradientEndX: endRel.x,
          gradientEndY: endRel.y,
          ...(cssAngle !== undefined ? { gradientAngle: cssAngle } : {}),
        },
        commit,
      )
    },
    [canvasToLocal, localToCanvas, width, height, layer.style, scheduleUpdate],
  )

  const handleEvents = (kind: 'start' | 'end') => ({
    draggable: true,
    onDragMove: (event: KonvaEventObject<DragEvent>) => applyDrag(event.target, kind, false),
    onDragEnd: (event: KonvaEventObject<DragEvent>) => applyDrag(event.target, kind, true),
    onMouseEnter: () => setCursor('move'),
    onMouseLeave: () => setCursor('default'),
  })

  return (
    <>
      {/* Eixo do gradiente */}
      <Line
        points={[startPos.x, startPos.y, endPos.x, endPos.y]}
        stroke={HANDLE_COLOR}
        strokeWidth={1.5 / scale}
        dash={[6 / scale, 4 / scale]}
        opacity={0.7}
        listening={false}
      />

      {/* Início (bolinha vazia = primeira cor) */}
      <Group x={startPos.x} y={startPos.y} {...handleEvents('start')}>
        <HandleDot scale={scale} filled={false} />
      </Group>

      {/* Fim (bolinha preenchida = última cor) */}
      <Group x={endPos.x} y={endPos.y} {...handleEvents('end')}>
        <HandleDot scale={scale} filled />
      </Group>
    </>
  )
}
