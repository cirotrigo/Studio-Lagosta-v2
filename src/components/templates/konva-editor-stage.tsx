"use client"

import * as React from 'react'
import Konva from 'konva'
import { Stage, Layer as KonvaLayer, Rect, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer } from '@/types/template'
import { KonvaLayerFactory } from './konva-layer-factory'
import { KonvaSelectionTransformer } from './konva-transformer'
import {
  computeAlignmentGuides,
  type RectInfo,
  type GuideLine,
  type SnapConfig,
  DEFAULT_SNAP_CONFIG,
} from '@/lib/konva-smart-guides'

/**
 * KonvaEditorStage - Componente principal do canvas Konva.js
 *
 * Funcionalidades:
 * - Renderização de todas as camadas do design
 * - Sistema de zoom simplificado (10%-500%, centralizado horizontalmente)
 * - Scroll vertical nativo quando necessário
 * - Smart Guides (alignment guides automáticos inspirados em Figma/Canva)
 * - Seleção múltipla com Shift/Ctrl
 * - Integração com transformer para resize/rotate
 * - Atalhos de teclado (Ctrl+Z/Y, Ctrl+C/V, Ctrl+0/+/-, Alt para desabilitar snap)
 *
 * @component
 */

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SCALE_BY = 1.05 // 5% por scroll


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
  const [showGrid, setShowGrid] = React.useState(false)
  const [snapConfig, setSnapConfig] = React.useState<SnapConfig>(DEFAULT_SNAP_CONFIG)
  const [snappingEnabled, setSnappingEnabled] = React.useState(true)
  const [showTestGuide, setShowTestGuide] = React.useState(false)
  const [showMarginGuides, setShowMarginGuides] = React.useState(false)
  const [fontsReady, setFontsReady] = React.useState(false)

  // Debug: verificar configuração inicial
  React.useEffect(() => {
    console.log('🔧 Smart Guides Config:', snapConfig)
    console.log('✅ Snapping Enabled:', snappingEnabled)
  }, [snapConfig, snappingEnabled])

  // Debug: monitorar mudanças nas guias
  React.useEffect(() => {
    console.log('📏 Guides atualizadas:', guides.length, guides)
  }, [guides])

  // Aguardar fontes estarem prontas e forçar re-render do Konva
  React.useEffect(() => {
    async function waitForFonts() {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          // Aguardar todas as fontes carregarem
          await document.fonts.ready
          console.log('✅ [KonvaEditorStage] document.fonts.ready - Todas as fontes estão prontas!')

          // Aguardar um frame adicional
          await new Promise(resolve => requestAnimationFrame(resolve))

          setFontsReady(true)

          // Forçar redraw do stage se já existir
          if (stageRef.current) {
            stageRef.current.batchDraw()
            console.log('🎨 [KonvaEditorStage] Stage re-renderizado com fontes prontas')
          }
        } catch (error) {
          console.warn('⚠️ [KonvaEditorStage] Erro ao aguardar fontes:', error)
          setFontsReady(true) // Continuar mesmo com erro
        }
      } else {
        setFontsReady(true)
      }
    }

    waitForFonts()
  }, [])

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height
  const deferredLayers = React.useDeferredValue(design.layers)

  React.useEffect(() => {
    if (stageRef.current) {
      setStageInstance(stageRef.current)
    }
    return () => setStageInstance(null)
  }, [setStageInstance])

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
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stage.scaleX()

      // Determinar direção do zoom
      const direction = event.evt.deltaY > 0 ? 1 / ZOOM_SCALE_BY : ZOOM_SCALE_BY

      // Calcular nova escala
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * direction))

      if (newScale === oldScale) return

      // Calcular offset para manter zoom centralizado
      // O zoom deve acontecer a partir do centro do canvas
      const stageWidth = stage.width()
      const stageHeight = stage.height()

      const centerX = stageWidth / 2
      const centerY = stageHeight / 2

      // Calcular nova posição para centralizar o zoom
      const newX = centerX - (centerX * newScale)
      const newY = centerY - (centerY * newScale)

      // Aplicar zoom
      stage.scale({ x: newScale, y: newScale })
      stage.position({ x: newX, y: newY })

      stage.batchDraw()

      // Atualizar estado React
      setZoom(newScale)
    },
    [setZoom],
  )


  // Zoom animado para atalhos de teclado
  const animateZoom = React.useCallback(
    (newScale: number, duration = 300) => {
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stage.scaleX()

      // Clampar escala aos limites
      const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale))
      if (clampedScale === oldScale) return

      // Calcular offset para manter zoom centralizado
      const stageWidth = stage.width()
      const stageHeight = stage.height()

      const centerX = stageWidth / 2
      const centerY = stageHeight / 2

      const newX = centerX - (centerX * clampedScale)
      const newY = centerY - (centerY * clampedScale)

      // Animar zoom usando Konva.Tween
      new Konva.Tween({
        node: stage,
        duration: duration / 1000,
        scaleX: clampedScale,
        scaleY: clampedScale,
        x: newX,
        y: newY,
        easing: Konva.Easings.EaseInOut,
        onUpdate: () => {
          setZoom(stage.scaleX())
        },
      }).play()
    },
    [setZoom],
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

      // Se as guias de margem estiverem ativas, adicionar retângulos invisíveis nas margens
      if (showMarginGuides) {
        const MARGIN = 70
        // Adicionar guias de margem como se fossem objetos invisíveis
        otherRects.push(
          { id: 'margin-left', x: MARGIN, y: 0, width: 0, height: canvasHeight },
          { id: 'margin-right', x: canvasWidth - MARGIN, y: 0, width: 0, height: canvasHeight },
          { id: 'margin-top', x: 0, y: MARGIN, width: canvasWidth, height: 0 },
          { id: 'margin-bottom', x: 0, y: canvasHeight - MARGIN, width: canvasWidth, height: 0 },
        )
      }

      // Usar a biblioteca otimizada de smart guides com configuração ativa
      const activeConfig = { ...snapConfig, enabled: snappingEnabled }
      const { guides: nextGuides, position } = computeAlignmentGuides(
        movingRect,
        otherRects,
        canvasWidth,
        canvasHeight,
        activeConfig,
      )

      // Debug: verificar se guias estão sendo computadas
      if (nextGuides.length > 0) {
        console.log('🎯 Smart Guides detectadas:', nextGuides)
      }

      if (position.x !== movingRect.x || position.y !== movingRect.y) {
        node.position(position)
      }

      setGuides(nextGuides)
    },
    [canvasHeight, canvasWidth, design.layers, snapConfig, snappingEnabled, showMarginGuides],
  )

  const handleLayerDragEnd = React.useCallback(() => {
    setGuides([])
  }, [])

  // Atalhos de teclado para zoom, copy/paste, undo/redo
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      const key = event.key.toLowerCase()
      const isModifier = event.metaKey || event.ctrlKey

      // Desabilitar snap temporariamente com Alt
      if (key === 'alt') {
        setSnappingEnabled(false)
        setGuides([])
        return
      }

      // Toggle guia de teste com 'g'
      if (key === 'g' && !isModifier) {
        setShowTestGuide(prev => !prev)
        console.log('🧪 Test guide toggled:', !showTestGuide)
        return
      }

      // Toggle guias de margem com 'r'
      if (key === 'r' && !isModifier) {
        setShowMarginGuides(prev => !prev)
        console.log('📐 Margin guides toggled:', !showMarginGuides)
        return
      }

      if (!isModifier) return

      // Atalhos de zoom (Ctrl/Cmd + +/- e Ctrl/Cmd + 0)
      if (key === '+' || key === '=') {
        event.preventDefault()
        const stage = stageRef.current
        if (!stage) return
        const newZoom = stage.scaleX() * 1.2
        animateZoom(newZoom, 200)
        return
      }

      if (key === '-' || key === '_') {
        event.preventDefault()
        const stage = stageRef.current
        if (!stage) return
        const newZoom = stage.scaleX() / 1.2
        animateZoom(newZoom, 200)
        return
      }

      if (key === '0') {
        event.preventDefault()
        animateZoom(1, 300) // Reset para 100%
        return
      }

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
      // Reativar snap quando soltar Alt
      if (event.key === 'Alt') {
        setSnappingEnabled(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [animateZoom, canRedo, canUndo, copySelectedLayers, pasteLayers, redo, selectedLayerIds.length, undo])

  // Prevenir zoom acidental do browser com Ctrl+Wheel
  React.useEffect(() => {
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
      }
    }

    document.addEventListener('wheel', preventBrowserZoom, { passive: false })
    return () => {
      document.removeEventListener('wheel', preventBrowserZoom)
    }
  }, [])

  return (
    <div className="flex h-full w-full flex-1 items-center justify-center overflow-x-hidden overflow-y-auto bg-[#f5f5f5] p-8 dark:bg-[#1a1a1a]">
      <div className="relative flex items-center justify-center" style={{ minHeight: '100%', minWidth: '100%' }}>
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          className="rounded-md shadow-2xl ring-1 ring-border/20"
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
          onClick={handleStagePointerDown}
          onWheel={handleWheel}
        >
          {/* Background layer - non-interactive (listening: false for performance) */}
          <KonvaLayer name="background-layer" listening={false}>
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
              listening={false}
            />
          </KonvaLayer>

          {/* Grid layer - non-interactive (listening: false for performance) */}
          {showGrid && (
            <KonvaLayer name="grid-layer" listening={false}>
              {Array.from({ length: Math.ceil(canvasWidth / 20) }).map((_, i) => (
                <Line
                  key={`v-${i}`}
                  points={[i * 20, 0, i * 20, canvasHeight]}
                  stroke="rgba(0,0,0,0.05)"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: Math.ceil(canvasHeight / 20) }).map((_, i) => (
                <Line
                  key={`h-${i}`}
                  points={[0, i * 20, canvasWidth, i * 20]}
                  stroke="rgba(0,0,0,0.05)"
                  strokeWidth={1}
                />
              ))}
            </KonvaLayer>
          )}

          <KonvaLayer name="content-layer">
            {deferredLayers.map((layer) => (
              <KonvaLayerFactory
                key={layer.id}
                layer={layer}
                disableInteractions={false}
                onSelect={(event) => handleLayerSelect(event, layer)}
                onChange={(updates) => handleLayerChange(layer.id, updates)}
                onDragMove={(event) => handleLayerDragMove(event, layer)}
                onDragEnd={handleLayerDragEnd}
                stageRef={stageRef}
              />
            ))}
            <KonvaSelectionTransformer selectedLayerIds={selectedLayerIds} stageRef={stageRef} />
          </KonvaLayer>

          {/* Smart Guides layer - DEVE estar por último para aparecer na frente */}
          <KonvaLayer name="guides-layer" listening={false}>
            {guides.length > 0 && console.log('🎨 Renderizando', guides.length, 'guias')}

            {/* Guias de margem (padding 70px) - Ativado com tecla 'R' */}
            {showMarginGuides && (
              <>
                {/* Borda esquerda - 70px */}
                <Line
                  points={[70, 0, 70, canvasHeight]}
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  opacity={0.7}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda direita - 70px */}
                <Line
                  points={[canvasWidth - 70, 0, canvasWidth - 70, canvasHeight]}
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  opacity={0.7}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda superior - 70px */}
                <Line
                  points={[0, 70, canvasWidth, 70]}
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  opacity={0.7}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda inferior - 70px */}
                <Line
                  points={[0, canvasHeight - 70, canvasWidth, canvasHeight - 70]}
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  opacity={0.7}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}

            {/* Guia de teste - para verificar se a renderização funciona */}
            {showTestGuide && (
              <>
                <Line
                  points={[canvasWidth / 2, 0, canvasWidth / 2, canvasHeight]}
                  stroke="#00FF00"
                  strokeWidth={3}
                  dash={[10, 10]}
                  opacity={1}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                <Line
                  points={[0, canvasHeight / 2, canvasWidth, canvasHeight / 2]}
                  stroke="#00FF00"
                  strokeWidth={3}
                  dash={[10, 10]}
                  opacity={1}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}

            {guides.map((guide, index) => {
              const points = guide.orientation === 'vertical'
                ? [guide.position, 0, guide.position, canvasHeight]
                : [0, guide.position, canvasWidth, guide.position]

              console.log(`📍 Guia ${index}:`, guide.orientation, 'pos:', guide.position, 'points:', points)

              return (
                <Line
                  key={`${guide.orientation}-${index}-${guide.position}`}
                  points={points}
                  stroke={snapConfig.guideColor}
                  strokeWidth={2}
                  dash={snapConfig.guideDash}
                  opacity={1}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )
            })}
          </KonvaLayer>
        </Stage>
      </div>
    </div>
  )
}
