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

const CURSORS = {
  default: 'default',
  grab: 'grab',
  grabbing: 'grabbing',
} as const

function getClientPosition(evt: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in evt && evt.touches.length > 0) {
    return { x: evt.touches[0]!.clientX, y: evt.touches[0]!.clientY }
  }
  if ('changedTouches' in evt && evt.changedTouches.length > 0) {
    return { x: evt.changedTouches[0]!.clientX, y: evt.changedTouches[0]!.clientY }
  }
  const mouseEvt = evt as MouseEvent
  return { x: mouseEvt.clientX, y: mouseEvt.clientY }
}

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
    undo,
    redo,
    canUndo,
    canRedo,
    setStageInstance,
  } = useTemplateEditor()

  const stageRef = React.useRef<Konva.Stage | null>(null)
  const [guides, setGuides] = React.useState<GuideLine[]>([])
  const [stagePosition, setStagePosition] = React.useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = React.useState(false)
  const spacePressedRef = React.useRef(false)
  const panStateRef = React.useRef<{ stagePos: { x: number; y: number }; client: { x: number; y: number } } | null>(null)

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height
  const deferredLayers = React.useDeferredValue(design.layers)

  const updateCursor = React.useCallback((cursor: keyof typeof CURSORS) => {
    const container = stageRef.current?.container()
    if (!container) return
    container.style.cursor = CURSORS[cursor]
  }, [])

  React.useEffect(() => {
    if (stageRef.current) {
      setStageInstance(stageRef.current)
      updateCursor(spacePressedRef.current ? 'grab' : 'default')
    }
    return () => setStageInstance(null)
  }, [setStageInstance, updateCursor])

  const handleStagePointerDown = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = event.target.getStage()
      if (!stage) return

      if (spacePressedRef.current) {
        panStateRef.current = {
          stagePos: stagePosition,
          client: getClientPosition(event.evt),
        }
        updateCursor('grabbing')
        return
      }

      const target = event.target as Konva.Node
      const clickedOnEmpty = target === stage || target.hasName?.('canvas-background')
      if (clickedOnEmpty) {
        clearLayerSelection()
      }
    },
    [clearLayerSelection, stagePosition, updateCursor],
  )

  const handleWheel = React.useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const direction = event.evt.deltaY > 0 ? -1 : 1
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + direction * WHEEL_STEP))
      if (nextZoom === zoom) return

      const mousePointTo = {
        x: (pointer.x - stagePosition.x) / zoom,
        y: (pointer.y - stagePosition.y) / zoom,
      }

      const newPosition = {
        x: pointer.x - mousePointTo.x * nextZoom,
        y: pointer.y - mousePointTo.y * nextZoom,
      }

      setZoom(nextZoom)
      setStagePosition(newPosition)
    },
    [setZoom, stagePosition.x, stagePosition.y, zoom],
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
      if (spacePressedRef.current) return
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
    const id = requestAnimationFrame(() => {
      const stage = stageRef.current
      if (stage) {
        stage.position(stagePosition)
        stage.batchDraw()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [deferredLayers, stagePosition, zoom])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (event.key === ' ') {
        if (!spacePressedRef.current) {
          spacePressedRef.current = true
          setIsPanning(true)
          updateCursor('grab')
          event.preventDefault()
        }
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

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          if (canRedo) redo()
        } else if (canUndo) {
          undo()
        }
      }

      if (key === 'y') {
        event.preventDefault()
        if (canRedo) redo()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        spacePressedRef.current = false
        panStateRef.current = null
        setIsPanning(false)
        updateCursor('default')
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!spacePressedRef.current || !panStateRef.current) return
      event.preventDefault()
      const { stagePos, client } = panStateRef.current
      const dx = event.clientX - client.x
      const dy = event.clientY - client.y
      setStagePosition({ x: stagePos.x + dx, y: stagePos.y + dy })
    }

    const handlePointerUp = () => {
      if (!panStateRef.current) return
      panStateRef.current = null
      if (spacePressedRef.current) {
        updateCursor('grab')
      } else {
        setIsPanning(false)
        updateCursor('default')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [canRedo, canUndo, copySelectedLayers, pasteLayers, redo, selectedLayerIds.length, undo, updateCursor])

  React.useEffect(() => {
    if (!spacePressedRef.current) {
      updateCursor('default')
    }
  }, [updateCursor])

  return (
    <div className="flex h-full w-full flex-1 items-center justify-center overflow-auto rounded-lg border border-border/40 bg-muted/50 p-8">
      <div className="relative flex h-full items-center justify-center" style={{ minWidth: canvasWidth * zoom + 40, minHeight: canvasHeight * zoom + 40 }}>
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePosition.x}
          y={stagePosition.y}
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
            {deferredLayers.map((layer) => (
              <KonvaLayerFactory
                key={layer.id}
                layer={layer}
                disableInteractions={isPanning}
                onSelect={(event) => handleLayerSelect(event, layer)}
                onChange={(updates) => handleLayerChange(layer.id, updates)}
                onDragMove={(event) => handleLayerDragMove(event, layer)}
                onDragEnd={handleLayerDragEnd}
              />
            ))}
            <KonvaSelectionTransformer selectedLayerIds={selectedLayerIds} stageRef={stageRef} />
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
