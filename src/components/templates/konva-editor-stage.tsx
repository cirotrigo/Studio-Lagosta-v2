"use client"

import * as React from 'react'
import Konva from 'konva'
import { Stage, Layer as KonvaLayer, Rect, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer } from '@/types/template'
import { KonvaLayerFactory } from './konva-layer-factory'
import { KonvaSelectionTransformer } from './konva-transformer'

interface RectInfo {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type GuideLine = {
  orientation: 'horizontal' | 'vertical'
  position: number
}

const GUIDE_THRESHOLD = 6

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const WHEEL_STEP = 0.05

export function KonvaEditorStage() {
  const {
    design,
    selectedLayerIds,
    selectLayer,
    clearLayerSelection,
    updateLayer,
    zoom,
    setZoom,
    copySelectedLayers,
    pasteLayers,
  } = useTemplateEditor()

  const stageRef = React.useRef<Konva.Stage | null>(null)
  const [guides, setGuides] = React.useState<GuideLine[]>([])

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const handleStagePointerDown = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = event.target.getStage()
      if (!stage) return
      const target = event.target as Konva.Node
      const clickedOnEmpty = target === stage || target.hasName?.('canvas-background')
      if (clickedOnEmpty) {
        clearLayerSelection()
      }
    },
    [clearLayerSelection],
  )

  const handleWheel = React.useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault()
      const direction = event.evt.deltaY > 0 ? -1 : 1
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + direction * WHEEL_STEP))
      setZoom(nextZoom)
    },
    [setZoom, zoom],
  )

  const handleLayerChange = React.useCallback(
    (layerId: string, updates: Partial<Layer>) => {
      updateLayer(layerId, (current) => ({
        ...current,
        ...updates,
        position: updates.position ? { ...current.position, ...updates.position } : current.position,
        size: updates.size ? { ...current.size, ...updates.size } : current.size,
        style: updates.style ? { ...current.style, ...updates.style } : current.style,
      }))
    },
    [updateLayer],
  )

  const handleLayerSelect = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>, layer: Layer) => {
      event.cancelBubble = true
      const additive = event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey
      selectLayer(layer.id, { additive, toggle: additive })
    },
    [selectLayer],
  )

  const handleLayerDragMove = React.useCallback(
    (event: KonvaEventObject<DragEvent>, layer: Layer) => {
      const node = event.target
      const movingRect: RectInfo = {
        id: layer.id,
        x: node.x(),
        y: node.y(),
        width: Math.max(1, layer.size?.width ?? node.width()),
        height: Math.max(1, layer.size?.height ?? node.height()),
      }

      const otherRects: RectInfo[] = design.layers
        .filter((item) => item.id !== layer.id)
        .map((item) => ({
          id: item.id,
          x: item.position?.x ?? 0,
          y: item.position?.y ?? 0,
          width: Math.max(1, item.size?.width ?? 0),
          height: Math.max(1, item.size?.height ?? 0),
        }))

      const { guides: nextGuides, position } = computeAlignmentGuides(
        movingRect,
        otherRects,
        canvasWidth,
        canvasHeight,
      )

      if (position.x !== movingRect.x || position.y !== movingRect.y) {
        node.position(position)
      }

      setGuides(nextGuides)
    },
    [canvasHeight, canvasWidth, design.layers],
  )

  const handleLayerDragEnd = React.useCallback(() => {
    setGuides([])
  }, [])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      const key = event.key.toLowerCase()
      const isModifier = event.metaKey || event.ctrlKey
      if (!isModifier) return

      if (key === 'c') {
        if (selectedLayerIds.length === 0) return
        event.preventDefault()
        copySelectedLayers()
      }

      if (key === 'v') {
        event.preventDefault()
        pasteLayers()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [copySelectedLayers, pasteLayers, selectedLayerIds.length])

  return (
    <div className="flex h-full w-full flex-1 items-center justify-center overflow-auto rounded-lg border border-border/40 bg-muted/50 p-8">
      <div className="relative flex h-full items-center justify-center" style={{ minWidth: canvasWidth * zoom + 40, minHeight: canvasHeight * zoom + 40 }}>
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          scaleX={zoom}
          scaleY={zoom}
          className="rounded-md shadow-lg"
          style={{ width: canvasWidth * zoom, height: canvasHeight * zoom, backgroundColor: 'transparent' }}
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
          onClick={handleStagePointerDown}
          onWheel={handleWheel}
        >
          <KonvaLayer listening={false}>
            <Rect
              name="canvas-background"
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              fill={design.canvas.backgroundColor ?? '#ffffff'}
              cornerRadius={8}
              shadowBlur={12}
              shadowOpacity={0.1}
            />
          </KonvaLayer>

          <KonvaLayer listening={false}>
            {guides.map((guide, index) => (
              <Line
                key={`${guide.orientation}-${index}-${guide.position}`}
                points={
                  guide.orientation === 'vertical'
                    ? [guide.position, 0, guide.position, canvasHeight]
                    : [0, guide.position, canvasWidth, guide.position]
                }
                stroke="#6366F1"
                strokeWidth={1}
                dash={[4, 4]}
              />
            ))}
          </KonvaLayer>

          <KonvaLayer>
            {design.layers.map((layer) => (
              <KonvaLayerFactory
                key={layer.id}
                layer={layer}
                isSelected={selectedLayerIds.includes(layer.id)}
                onSelect={(event) => handleLayerSelect(event, layer)}
                onChange={(updates) => handleLayerChange(layer.id, updates)}
                onDragMove={(event) => handleLayerDragMove(event, layer)}
                onDragEnd={handleLayerDragEnd}
              />
            ))}
            <KonvaSelectionTransformer
              selectedLayerIds={selectedLayerIds}
              stageRef={stageRef}
            />
          </KonvaLayer>
        </Stage>
      </div>
    </div>
  )
}

function computeAlignmentGuides(
  moving: RectInfo,
  others: RectInfo[],
  stageWidth: number,
  stageHeight: number,
): { guides: GuideLine[]; position: { x: number; y: number } } {
  const lineGuideStops = getLineGuideStops(stageWidth, stageHeight, others)
  const itemEdges = getObjectSnappingEdges(moving)

  let snapX = moving.x
  let snapY = moving.y
  let vGuide: GuideLine | null = null
  let hGuide: GuideLine | null = null
  let minDiffV = GUIDE_THRESHOLD
  let minDiffH = GUIDE_THRESHOLD

  lineGuideStops.vertical.forEach((lineGuide) => {
    itemEdges.vertical.forEach((itemEdge) => {
      const diff = Math.abs(lineGuide - itemEdge.guide) 
      if (diff < minDiffV) {
        minDiffV = diff
        snapX = lineGuide - itemEdge.offset
        vGuide = { orientation: 'vertical', position: lineGuide }
      }
    })
  })

  lineGuideStops.horizontal.forEach((lineGuide) => {
    itemEdges.horizontal.forEach((itemEdge) => {
      const diff = Math.abs(lineGuide - itemEdge.guide)
      if (diff < minDiffH) {
        minDiffH = diff
        snapY = lineGuide - itemEdge.offset
        hGuide = { orientation: 'horizontal', position: lineGuide }
      }
    })
  })

  const guides: GuideLine[] = []
  if (vGuide && minDiffV < GUIDE_THRESHOLD) {
    guides.push(vGuide)
  } else {
    snapX = moving.x
  }

  if (hGuide && minDiffH < GUIDE_THRESHOLD) {
    guides.push(hGuide)
  } else {
    snapY = moving.y
  }

  return {
    guides,
    position: {
      x: snapX,
      y: snapY,
    },
  }
}

function getLineGuideStops(stageWidth: number, stageHeight: number, rects: RectInfo[]) {
  const vertical: number[] = [0, stageWidth / 2, stageWidth]
  const horizontal: number[] = [0, stageHeight / 2, stageHeight]

  rects.forEach((rect) => {
    vertical.push(rect.x, rect.x + rect.width / 2, rect.x + rect.width)
    horizontal.push(rect.y, rect.y + rect.height / 2, rect.y + rect.height)
  })

  return { vertical, horizontal }
}

function getObjectSnappingEdges(rect: RectInfo) {
  const { x, y, width, height } = rect

  return {
    vertical: [
      { guide: x, offset: 0 },
      { guide: x + width / 2, offset: width / 2 },
      { guide: x + width, offset: width },
    ],
    horizontal: [
      { guide: y, offset: 0 },
      { guide: y + height / 2, offset: height / 2 },
      { guide: y + height, offset: height },
    ],
  }
}
