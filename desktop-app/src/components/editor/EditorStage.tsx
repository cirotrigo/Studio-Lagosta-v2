import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Layer as KonvaLayer, Line, Rect, Stage, Transformer, Group } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { LayerFactory } from './LayerFactory'
import { Ruler, RulerCorner } from './canvas/Ruler'
import { AlignmentQuickMenu, type AlignmentType } from './canvas/AlignmentQuickMenu'
import { ImageCropOverlay } from './canvas/ImageCropOverlay'
import { computeSmartGuides, type GuideLine } from '@/lib/editor/smart-guides'
import {
  convertAbsoluteTextPositionToOffsets,
} from '@/lib/editor/text-layout'
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
  const cropMode = useEditorStore((state) => state.cropMode)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)
  const enterCropMode = useEditorStore((state) => state.enterCropMode)
  const exitCropMode = useEditorStore((state) => state.exitCropMode)

  const [containerSize, setContainerSize] = useState({ width: 1200, height: 900 })
  const [guides, setGuides] = useState<GuideLine[]>([])
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [showRulers, setShowRulers] = useState(true)

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
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Crop mode keyboard handling
      if (cropMode) {
        if (event.key === 'Escape') {
          event.preventDefault()
          exitCropMode(false) // Cancel
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          exitCropMode(true) // Confirm
          return
        }
        return // Block other keys while in crop mode
      }

      // Delete/Backspace para excluir elementos
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTextInput && selectedLayerIds.length > 0) {
        event.preventDefault()
        removeSelectedLayers()
      }

      // R para toggle das réguas
      if (event.key === 'r' && !isTextInput) {
        setShowRulers((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedLayerIds, removeSelectedLayers, cropMode, exitCropMode])

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

  const selectedLayers = useMemo(
    () => orderedLayers.filter((layer) => selectedLayerIds.includes(layer.id)),
    [orderedLayers, selectedLayerIds],
  )

  const handleAlign = useCallback(
    (alignment: AlignmentType) => {
      if (!currentPage || selectedLayers.length === 0) return

      const pageWidth = currentPage.width
      const pageHeight = currentPage.height

      selectedLayers.forEach((layer) => {
        updateLayer(layer.id, (l) => {
          const width = l.width ?? 100
          const height = l.height ?? 100

          switch (alignment) {
            case 'left':
              return { ...l, x: 0 }
            case 'center-h':
              return { ...l, x: (pageWidth - width) / 2 }
            case 'right':
              return { ...l, x: pageWidth - width }
            case 'top':
              return { ...l, y: 0 }
            case 'center-v':
              return { ...l, y: (pageHeight - height) / 2 }
            case 'bottom':
              return { ...l, y: pageHeight - height }
            default:
              return l
          }
        }, false)
      })
    },
    [currentPage, selectedLayers, updateLayer],
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

    // Pinch-to-zoom no Mac (ctrlKey = true) ou Ctrl+Scroll no Windows
    if (event.evt.ctrlKey || event.evt.metaKey) {
      const pointer = stage.getPointerPosition()
      if (!pointer) {
        return
      }

      const oldZoom = zoom
      // Pinch usa deltaY invertido e com valores menores
      const zoomFactor = event.evt.deltaY > 0 ? 0.97 : 1.03
      const nextZoom = oldZoom * zoomFactor
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))

      // Zoom mantendo o ponto sob o cursor fixo
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
    } else {
      // Panning com dois dedos no trackpad (scroll normal)
      setPan({
        x: Math.round(pan.x - event.evt.deltaX),
        y: Math.round(pan.y - event.evt.deltaY),
      })
    }
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
    updateLayer(layer.id, (currentLayer) => {
      if ((currentLayer.type === 'text' || currentLayer.type === 'rich-text') && currentLayer.textStyle?.safeArea?.enabled) {
        const offsets = convertAbsoluteTextPositionToOffsets(
          currentPage,
          currentLayer,
          event.target.x(),
          event.target.y(),
          currentLayer.width,
          currentLayer.height,
        )

        return {
          ...currentLayer,
          x: offsets.x,
          y: offsets.y,
        }
      }

      return {
        ...currentLayer,
        x: Math.round(event.target.x()),
        y: Math.round(event.target.y()),
      }
    })
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

    if (layer.type === 'image') {
      // Enter crop mode for images
      enterCropMode(layer.id)
      return
    }

    if (layer.type === 'logo' || layer.type === 'icon') {
      const nextSource = window.prompt('Defina a URL da imagem', layer.src)
      if (nextSource !== null) {
        updateLayer(layer.id, (currentLayer) =>
          currentLayer.type === 'logo' || currentLayer.type === 'icon'
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
        width: nextWidth,
        height: nextHeight,
        rotation: Math.round(node.rotation()),
      }

      if ((layer.type === 'text' || layer.type === 'rich-text') && layer.textStyle?.fontSize) {
        const nextFontSize = Math.max(12, Math.round(layer.textStyle.fontSize * Math.max(scaleX, scaleY)))
        partial.textStyle = {
          ...layer.textStyle,
          fontSize: nextFontSize,
          minFontSize: layer.textStyle.minFontSize
            ? Math.max(8, Math.round(layer.textStyle.minFontSize * Math.max(scaleX, scaleY)))
            : layer.textStyle.minFontSize,
          maxFontSize: layer.textStyle.maxFontSize
            ? Math.max(8, Math.round(layer.textStyle.maxFontSize * Math.max(scaleX, scaleY)))
            : layer.textStyle.maxFontSize,
        }

        if (layer.textStyle?.safeArea?.enabled) {
          const offsets = convertAbsoluteTextPositionToOffsets(
            currentPage,
            {
              ...layer,
              width: nextWidth,
              height: nextHeight,
              textStyle: partial.textStyle as typeof layer.textStyle,
            },
            node.x(),
            node.y(),
            nextWidth,
            nextHeight,
          )

          partial.x = offsets.x
          partial.y = offsets.y
        } else {
          partial.x = Math.round(node.x())
          partial.y = Math.round(node.y())
        }
      } else {
        partial.x = Math.round(node.x())
        partial.y = Math.round(node.y())
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
      className={`relative h-full rounded-2xl border border-border bg-[#0c111d] ${isSpacePressed ? 'cursor-grab' : 'cursor-default'}`}
    >
      {/* Réguas de precisão */}
      {showRulers && (
        <>
          <RulerCorner />
          <Ruler
            orientation="horizontal"
            size={containerSize.width - 20}
            pageSize={currentPage.width}
            pageOffset={pagePosition.x - 20}
            zoom={zoom}
          />
          <Ruler
            orientation="vertical"
            size={containerSize.height - 20}
            pageSize={currentPage.height}
            pageOffset={pagePosition.y - 20}
            zoom={zoom}
          />
        </>
      )}

      {/* Quick Menu de alinhamento */}
      {selectedLayers.length > 0 && (
        <AlignmentQuickMenu
          selectedLayers={selectedLayers}
          pagePosition={pagePosition}
          zoom={zoom}
          onAlign={handleAlign}
        />
      )}

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
              onClick={() => {
                if (cropMode) {
                  exitCropMode(true) // Confirm crop on click outside
                } else {
                  clearSelection()
                }
              }}
              onTap={() => {
                if (cropMode) {
                  exitCropMode(true)
                } else {
                  clearSelection()
                }
              }}
            />

            {orderedLayers.map((layer) => (
              <LayerFactory
                key={layer.id}
                page={currentPage}
                layer={layer}
                isSelected={selectedLayerIds.includes(layer.id) && !cropMode}
                onSelect={handleLayerSelect}
                onDragMove={handleLayerDragMove}
                onDragEnd={handleLayerDragEnd}
                onDirectEdit={handleDirectEdit}
              />
            ))}

            {/* Image Crop Mode Overlay */}
            {cropMode && (() => {
              const cropLayer = currentPage.layers.find((l) => l.id === cropMode.layerId)
              if (cropLayer?.type === 'image') {
                return (
                  <ImageCropOverlay
                    page={currentPage}
                    layer={cropLayer}
                    zoom={zoom}
                  />
                )
              }
              return null
            })()}

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
          </Group>

          {/* Transformer fora do Group escalado para manter handles com tamanho fixo */}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            borderStroke="#F59E0B"
            borderStrokeWidth={2}
            anchorStroke="#F59E0B"
            anchorFill="#FDF4E7"
            anchorSize={8}
            anchorCornerRadius={2}
            onTransformEnd={handleTransformEnd}
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) {
                return oldBox
              }
              return newBox
            }}
          />
        </KonvaLayer>
      </Stage>

      {/* Crop Mode UI */}
      {cropMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl bg-background/95 px-4 py-3 shadow-xl backdrop-blur-sm border border-border">
          <span className="text-sm text-text-muted">
            Arraste para ajustar o enquadramento
          </span>
          <button
            type="button"
            onClick={() => exitCropMode(false)}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-text hover:bg-background/80 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => exitCropMode(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Concluir
          </button>
        </div>
      )}
    </div>
  )
}
