import { useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Layer as KonvaLayer, Line, Rect, Stage, Transformer, Group } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { LayerFactory } from './LayerFactory'
import { computeSmartGuides, type GuideLine } from '@/lib/editor/smart-guides'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import type { Layer } from '@/types/template'

// @ts-expect-error Konva uses this internal flag for text sharpness.
Konva._fixTextRendering = true

const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.5

function getLayerBounds(layer: Layer, node?: Konva.Node | null) {
  const width =
    node && 'width' in node && typeof node.width === 'function'
      ? Math.max(20, node.width() * node.scaleX())
      : layer.width ?? 240
  const height =
    node && 'height' in node && typeof node.height === 'function'
      ? Math.max(20, node.height() * node.scaleY())
      : layer.height ?? 120

  return {
    width,
    height,
  }
}

export function EditorStage() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const panDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const currentPage = useEditorStore(selectCurrentPageState)
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds)
  const zoom = useEditorStore((state) => state.zoom)
  const pan = useEditorStore((state) => state.pan)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)

  const [containerSize, setContainerSize] = useState({ width: 1200, height: 900 })
  const [guides, setGuides] = useState<GuideLine[]>([])
  const [isSpacePressed, setIsSpacePressed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setContainerSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height),
      })
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(true)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false)
        panDragRef.current = null
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const transformer = transformerRef.current
    if (!stage || !transformer) {
      return
    }

    const nodes = selectedLayerIds
      .map((layerId) => stage.findOne(`#${layerId}`))
      .filter((node): node is Konva.Node => Boolean(node))

    transformer.nodes(nodes)
    transformer.keepRatio(
      nodes.some((node) => {
        const layer = currentPage?.layers.find((item) => item.id === node.id())
        return layer?.type === 'image' || layer?.type === 'logo' || layer?.type === 'icon'
      }),
    )
    transformer.getLayer()?.batchDraw()
  }, [currentPage, selectedLayerIds])

  const pagePosition = useMemo(() => {
    if (!currentPage) {
      return { x: 0, y: 0 }
    }

    return {
      x: containerSize.width / 2 - (currentPage.width * zoom) / 2 + pan.x,
      y: containerSize.height / 2 - (currentPage.height * zoom) / 2 + pan.y,
    }
  }, [containerSize.height, containerSize.width, currentPage, pan.x, pan.y, zoom])

  const orderedLayers = useMemo(
    () => currentPage?.layers ?? [],
    [currentPage],
  )

  if (!currentPage) {
    return (
      <div ref={containerRef} className="flex h-full items-center justify-center rounded-2xl border border-border bg-card/40">
        <p className="text-sm text-text-muted">Nenhuma página disponível.</p>
      </div>
    )
  }

  const handleCanvasPointerDown = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!stageRef.current) {
      return
    }

    if (isSpacePressed) {
      const pointer = stageRef.current.getPointerPosition()
      if (!pointer) {
        return
      }

      panDragRef.current = {
        startX: pointer.x,
        startY: pointer.y,
        originX: pan.x,
        originY: pan.y,
      }
      return
    }

    if (event.target === event.target.getStage()) {
      clearSelection()
      setGuides([])
    }
  }

  const handleCanvasPointerMove = () => {
    if (!stageRef.current || !panDragRef.current) {
      return
    }

    const pointer = stageRef.current.getPointerPosition()
    if (!pointer) {
      return
    }

    setPan({
      x: Math.round(panDragRef.current.originX + pointer.x - panDragRef.current.startX),
      y: Math.round(panDragRef.current.originY + pointer.y - panDragRef.current.startY),
    })
  }

  const stopPanning = () => {
    panDragRef.current = null
  }

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()

    const stage = stageRef.current
    if (!stage) {
      return
    }

    const pointer = stage.getPointerPosition()
    if (!pointer) {
      return
    }

    const oldZoom = zoom
    const nextZoom = event.evt.deltaY > 0 ? oldZoom * 0.94 : oldZoom * 1.06
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))

    const oldPageX = containerSize.width / 2 - (currentPage.width * oldZoom) / 2 + pan.x
    const oldPageY = containerSize.height / 2 - (currentPage.height * oldZoom) / 2 + pan.y
    const mousePoint = {
      x: (pointer.x - oldPageX) / oldZoom,
      y: (pointer.y - oldPageY) / oldZoom,
    }

    const newPageX = pointer.x - mousePoint.x * clampedZoom
    const newPageY = pointer.y - mousePoint.y * clampedZoom
    const centeredPageX = containerSize.width / 2 - (currentPage.width * clampedZoom) / 2
    const centeredPageY = containerSize.height / 2 - (currentPage.height * clampedZoom) / 2

    setZoom(Number(clampedZoom.toFixed(3)))
    setPan({
      x: Math.round(newPageX - centeredPageX),
      y: Math.round(newPageY - centeredPageY),
    })
  }

  const handleLayerSelect = (event: KonvaEventObject<MouseEvent | TouchEvent>, layerId: string) => {
    const additive = event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey
    selectLayer(layerId, additive)
  }

  const handleLayerDragMove = (event: KonvaEventObject<DragEvent>, layer: Layer) => {
    const node = event.target
    const bounds = getLayerBounds(layer, node)
    const snap = computeSmartGuides(
      currentPage,
      layer.id,
      {
        x: node.x(),
        y: node.y(),
        width: bounds.width,
        height: bounds.height,
      },
      10,
    )

    node.position({ x: snap.x, y: snap.y })
    setGuides(snap.guides)
  }

  const handleLayerDragEnd = (event: KonvaEventObject<DragEvent>, layer: Layer) => {
    setGuides([])
    updateLayer(layer.id, (currentLayer) => ({
      ...currentLayer,
      x: Math.round(event.target.x()),
      y: Math.round(event.target.y()),
    }))
  }

  const handleDirectEdit = (layer: Layer) => {
    if (layer.type === 'text' || layer.type === 'rich-text') {
      const text = window.prompt('Editar texto da layer', layer.text)
      if (text !== null) {
        updateLayer(layer.id, (currentLayer) =>
          currentLayer.type === 'text' || currentLayer.type === 'rich-text'
            ? { ...currentLayer, text }
            : currentLayer,
        )
      }
      return
    }

    if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon') {
      const nextSource = window.prompt('Defina a URL da imagem', layer.src)
      if (nextSource !== null) {
        updateLayer(layer.id, (currentLayer) =>
          currentLayer.type === 'image' || currentLayer.type === 'logo' || currentLayer.type === 'icon'
            ? { ...currentLayer, src: nextSource }
            : currentLayer,
        )
      }
    }
  }

  const handleTransformEnd = () => {
    const transformer = transformerRef.current
    if (!transformer || !selectedLayerIds.length) {
      return
    }

    const nodes = transformer.nodes()
    const nextById = new Map<string, Partial<Layer>>()

    nodes.forEach((node) => {
      const layerId = node.id()
      const layer = currentPage.layers.find((item) => item.id === layerId)
      if (!layer) {
        return
      }

      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      const nextWidth = Math.max(20, Math.round((layer.width ?? node.width()) * scaleX))
      const nextHeight = Math.max(20, Math.round((layer.height ?? node.height()) * scaleY))
      const partial: Record<string, unknown> = {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: nextWidth,
        height: nextHeight,
        rotation: Math.round(node.rotation()),
      }

      if ((layer.type === 'text' || layer.type === 'rich-text') && layer.textStyle?.fontSize) {
        partial.textStyle = {
          ...layer.textStyle,
          fontSize: Math.max(12, Math.round(layer.textStyle.fontSize * Math.max(scaleX, scaleY))),
        }
      }

      nextById.set(layerId, partial as Partial<Layer>)
      node.scaleX(1)
      node.scaleY(1)
    })

    if (!nextById.size) {
      return
    }

    const firstLayerId = selectedLayerIds[0]
    updateLayer(
      firstLayerId,
      (currentLayer) => {
        const partial = nextById.get(currentLayer.id)
        return partial ? ({ ...currentLayer, ...partial } as Layer) : currentLayer
      },
      true,
    )

    selectedLayerIds.slice(1).forEach((layerId) => {
      updateLayer(
        layerId,
        (currentLayer) => {
          const partial = nextById.get(currentLayer.id)
          return partial ? ({ ...currentLayer, ...partial } as Layer) : currentLayer
        },
        false,
      )
    })

    setGuides([])
  }

  return (
    <div
      ref={containerRef}
      className={`h-full rounded-2xl border border-border bg-[#0c111d] ${isSpacePressed ? 'cursor-grab' : 'cursor-default'}`}
    >
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        onMouseDown={handleCanvasPointerDown}
        onTouchStart={handleCanvasPointerDown}
        onMouseMove={handleCanvasPointerMove}
        onTouchMove={handleCanvasPointerMove}
        onMouseUp={stopPanning}
        onTouchEnd={stopPanning}
        onMouseLeave={stopPanning}
        onWheel={handleWheel}
      >
        <KonvaLayer listening={false}>
          <Rect width={containerSize.width} height={containerSize.height} fill="#0c111d" />
        </KonvaLayer>

        <KonvaLayer>
          <Group x={pagePosition.x} y={pagePosition.y} scaleX={zoom} scaleY={zoom}>
            <Rect
              width={currentPage.width}
              height={currentPage.height}
              fill={currentPage.background ?? '#FFFFFF'}
              shadowColor="#000000"
              shadowBlur={24}
              shadowOpacity={0.22}
              shadowOffset={{ x: 0, y: 18 }}
              onClick={() => clearSelection()}
              onTap={() => clearSelection()}
            />

            {orderedLayers.map((layer) => (
              <LayerFactory
                key={layer.id}
                layer={layer}
                isSelected={selectedLayerIds.includes(layer.id)}
                onSelect={handleLayerSelect}
                onDragMove={handleLayerDragMove}
                onDragEnd={handleLayerDragEnd}
                onDirectEdit={handleDirectEdit}
              />
            ))}

            {guides.map((guide) =>
              guide.orientation === 'vertical' ? (
                <Line
                  key={`${guide.orientation}-${guide.position}`}
                  points={[guide.position, 0, guide.position, currentPage.height]}
                  stroke="#F59E0B"
                  strokeWidth={2 / zoom}
                  dash={[10 / zoom, 8 / zoom]}
                  listening={false}
                />
              ) : (
                <Line
                  key={`${guide.orientation}-${guide.position}`}
                  points={[0, guide.position, currentPage.width, guide.position]}
                  stroke="#F59E0B"
                  strokeWidth={2 / zoom}
                  dash={[10 / zoom, 8 / zoom]}
                  listening={false}
                />
              ),
            )}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              borderStroke="#F59E0B"
              borderStrokeWidth={2 / zoom}
              anchorStroke="#F59E0B"
              anchorFill="#FDF4E7"
              anchorSize={10 / zoom}
              anchorCornerRadius={3}
              onTransformEnd={handleTransformEnd}
              boundBoxFunc={(oldBox, newBox) => {
                if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) {
                  return oldBox
                }
                return newBox
              }}
            />
          </Group>
        </KonvaLayer>
      </Stage>
    </div>
  )
}
