"use client"

import * as React from 'react'
import Konva from 'konva'
import { Stage, Layer as KonvaLayer, Rect, Line } from 'react-konva'

// IMPORTANTE: Ativar fix de renderização para melhor qualidade de fontes
// Especialmente importante para fontes ornamentadas/decorativas
// @ts-expect-error - Propriedade interna do Konva não documentada nos tipos
Konva._fixTextRendering = true
import type { KonvaEventObject } from 'konva/lib/Node'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer } from '@/types/template'
import { KonvaLayerFactory } from './konva-layer-factory'
import { KonvaSelectionTransformer } from './konva-transformer'
import { KonvaImageCropOverlay } from './konva-image-crop'
import { KonvaGradientHandles } from './konva-gradient-handles'
import {
  computeAlignmentGuides,
  type RectInfo,
  type GuideLine,
  type SnapConfig,
  DEFAULT_SNAP_CONFIG,
} from '@/lib/konva-smart-guides'
import { CANVAS_MARGIN } from '@/lib/canvas-margin'
import { useIsMobile } from '@/hooks/use-device-detection'

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


export function KonvaEditorStage() {
  const {
    projectId,
    design,
    selectedLayerIds,
    selectLayer,
    selectLayers,
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
    focusTextMode,
    alignSelectedLeft,
    alignSelectedCenterH,
    alignSelectedRight,
    alignSelectedTop,
    alignSelectedMiddleV,
    alignSelectedBottom,
    distributeSelectedH,
    distributeSelectedV,
    bringSelectedToFront,
    sendSelectedToBack,
    moveSelectedForward,
    moveSelectedBackward,
    croppingLayerId,
  } = useTemplateEditor()

  // OTIMIZAÇÃO MOBILE: Detectar dispositivo para desabilitar features pesadas
  const isMobile = useIsMobile()

  const stageRef = React.useRef<Konva.Stage | null>(null)
  const [guides, setGuides] = React.useState<GuideLine[]>([])
  const [showGrid, _setShowGrid] = React.useState(false)
  const [snapConfig, _setSnapConfig] = React.useState<SnapConfig>(DEFAULT_SNAP_CONFIG)
  // OTIMIZAÇÃO MOBILE: Desabilitar snapping em mobile (pesado de calcular)
  const [snappingEnabled, setSnappingEnabled] = React.useState(!isMobile)
  const [showMarginGuides, setShowMarginGuides] = React.useState(true)
  // Bordas amarelas do canvas: ferramenta de conferência, desligada por padrão
  // (era um resto de debug que vinha ligado em produção, junto com a cruz verde)
  const [showCanvasBounds, setShowCanvasBounds] = React.useState(false)
  const [_fontsReady, setFontsReady] = React.useState(false)

  // Drag-to-select state
  const [selectionRect, setSelectionRect] = React.useState<{
    visible: boolean
    x: number
    y: number
    width: number
    height: number
  }>({ visible: false, x: 0, y: 0, width: 0, height: 0 })
  const selectionStartRef = React.useRef<{ x: number; y: number } | null>(null)

  // Multi-touch pinch-to-zoom state
  const lastCenterRef = React.useRef<{ x: number; y: number } | null>(null)
  const lastDistRef = React.useRef(0)

  // Debug: verificar configuração inicial (desabilitado)
  // React.useEffect(() => {
  //   console.log('🔧 Smart Guides Config:', snapConfig)
  //   console.log('✅ Snapping Enabled:', snappingEnabled)
  // }, [snapConfig, snappingEnabled])

  // Debug: monitorar mudanças nas guias (desabilitado)
  // React.useEffect(() => {
  //   console.log('📏 Guides atualizadas:', guides.length, guides)
  // }, [guides])

  // OTIMIZAÇÃO MOBILE: Ajustar pixel ratio em dispositivos retina
  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const isRetina = window.devicePixelRatio > 1
    const originalPixelRatio = Konva.pixelRatio

    if (isMobile && isRetina) {
      // Reduzir para 1 em mobile retina melhora performance em 50-75%
      Konva.pixelRatio = 1
      console.log('📱 [Mobile Optimization] Pixel ratio ajustado:', window.devicePixelRatio, '→ 1')
    }

    return () => {
      // Restaurar ao desmontar
      Konva.pixelRatio = originalPixelRatio
    }
  }, [])

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
        } catch (_error) {
          console.warn('⚠️ [KonvaEditorStage] Erro ao aguardar fontes:', _error)
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

  // Container ref para calcular tamanho disponível
  const _containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (stageRef.current) {
      setStageInstance(stageRef.current)
    }
    return () => setStageInstance(null)
  }, [setStageInstance])

  // MOBILE: Calcular zoom inicial para caber na tela
  React.useEffect(() => {
    if (!isMobile) return

    const stage = stageRef.current
    if (!stage) return

    const container = stage.container().parentElement
    if (!container) return

    // Função para calcular e aplicar zoom ideal
    const fitToContainer = () => {
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      if (containerWidth === 0 || containerHeight === 0) {
        console.warn('📱 [Mobile] Container sem dimensões ainda')
        return
      }

      // Calcular zoom para caber na largura com margem
      const margin = 16 // Margem total (8px de cada lado)
      const availableWidth = containerWidth - margin
      const fitZoom = availableWidth / canvasWidth

      // Limitar zoom entre 15% e 80% (nunca chegar a 100% no mobile)
      const clampedZoom = Math.max(0.15, Math.min(0.8, fitZoom))

      console.log('📱 [Mobile] Auto-zoom aplicado:', {
        containerWidth,
        containerHeight,
        canvasWidth,
        canvasHeight,
        availableWidth,
        fitZoom: fitZoom.toFixed(3),
        clampedZoom: clampedZoom.toFixed(3),
        zoomPercentage: Math.round(clampedZoom * 100) + '%'
      })

      // Aplicar zoom e posição
      setZoom(clampedZoom)
      stage.scale({ x: clampedZoom, y: clampedZoom })
      stage.position({ x: margin / 2, y: 0 })
      stage.batchDraw()
    }

    // Aplicar zoom inicial após um pequeno delay
    const timeoutId = setTimeout(fitToContainer, 150)

    // Observer para detectar mudanças de tamanho
    const resizeObserver = new ResizeObserver(() => {
      fitToContainer()
    })

    resizeObserver.observe(container)

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [isMobile, canvasWidth, canvasHeight, setZoom])

  // DESKTOP: Resize Observer para recentralizar quando o container mudar
  React.useEffect(() => {
    if (isMobile) return

    const stage = stageRef.current
    if (!stage) return

    const container = stage.container().parentElement
    if (!container) return

    // Função para recentralizar
    const centerCanvas = () => {
      const stageWidth = container.clientWidth
      const _stageHeight = container.clientHeight

      // Atualizar tamanho do stage para corresponder ao container
      stage.width(stageWidth)
      stage.height(_stageHeight)

      // Recalcular posição
      const scaledCanvasWidth = canvasWidth * stage.scaleX()

      let newX = 0
      if (scaledCanvasWidth < stageWidth) {
        newX = (stageWidth - scaledCanvasWidth) / 2
      } else {
        newX = 32 // Margem mínima à esquerda se não couber
      }

      const currentY = stage.y()
      stage.position({ x: newX, y: currentY })
      stage.batchDraw()
    }

    const resizeObserver = new ResizeObserver(() => {
      // Pequeno debounce para evitar cálculos excessivos
      requestAnimationFrame(centerCanvas)
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isMobile, canvasWidth])

  // Sincronizar estado zoom com Konva stage.scale()
  // Desktop: mantém canvas centralizado horizontalmente
  // Mobile: aplica zoom mantendo margem fixa
  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const currentScale = stage.scaleX()
    const currentPos = stage.position()

    // Se o zoom mudou externamente (pelos botões), aplicar no stage
    if (Math.abs(currentScale - zoom) > 0.001) {
      // Obter dimensões do stage (container)
      const stageWidth = stage.width()
      const _stageHeight = stage.height()

      // Dimensões do canvas escalado
      const scaledCanvasWidth = canvasWidth * zoom
      const _scaledCanvasHeight = canvasHeight * zoom

      let newX = 0
      const newY = 0

      if (isMobile) {
        // MOBILE: Margem fixa de 8px, sempre à esquerda
        newX = 8
      } else {
        // DESKTOP: Centralizar horizontalmente se cabe na tela
        if (scaledCanvasWidth < stageWidth) {
          newX = (stageWidth - scaledCanvasWidth) / 2
        } else {
          newX = 0 // Se não cabe, alinhar à esquerda
        }
      }

      // Sempre aplicar zoom quando mudou
      console.log('🔄 [Zoom Sync] Aplicando zoom:', {
        zoom: zoom.toFixed(3),
        newX,
        newY,
        isMobile
      })
      stage.scale({ x: zoom, y: zoom })
      stage.position({ x: newX, y: newY })
      stage.batchDraw()
    }
  }, [zoom, canvasWidth, canvasHeight, isMobile])

  const handleStagePointerDown = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Modo de recorte: o overlay é dono de todos os gestos (nada de marquee)
      if (croppingLayerId) return
      const stage = event.target.getStage()
      if (!stage) return

      const target = event.target as Konva.Node
      const clickedOnEmpty = target === stage || target.hasName?.('canvas-background')

      if (clickedOnEmpty) {
        // Start drag-to-select
        const pointerPos = stage.getPointerPosition()
        if (!pointerPos) return

        selectionStartRef.current = { x: pointerPos.x, y: pointerPos.y }
        setSelectionRect({
          visible: true,
          x: pointerPos.x,
          y: pointerPos.y,
          width: 0,
          height: 0,
        })
      }
    },
    [croppingLayerId],
  )

  const handleStagePointerMove = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!selectionStartRef.current) return

      const stage = event.target.getStage()
      if (!stage) return

      const pointerPos = stage.getPointerPosition()
      if (!pointerPos) return

      const x1 = selectionStartRef.current.x
      const y1 = selectionStartRef.current.y
      const x2 = pointerPos.x
      const y2 = pointerPos.y

      setSelectionRect({
        visible: true,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      })
    },
    [],
  )

  const handleStagePointerUp = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!selectionStartRef.current) return

      const stage = event.target.getStage()
      if (!stage) return

      // Get final selection rectangle
      const box = {
        x: selectionRect.x,
        y: selectionRect.y,
        width: selectionRect.width,
        height: selectionRect.height,
      }

      // Find all shapes that intersect with selection rectangle
      const selectedIds: string[] = []

      design.layers.forEach((layer) => {
        const node = stage.findOne(`#${layer.id}`)
        if (node) {
          const nodeBox = node.getClientRect()
          const hasIntersection = Konva.Util.haveIntersection(box, nodeBox)
          if (hasIntersection) {
            selectedIds.push(layer.id)
          }
        }
      })

      // Apply selection
      if (selectedIds.length > 0) {
        selectLayers(selectedIds)
      } else {
        clearLayerSelection()
      }

      // Reset selection rectangle
      selectionStartRef.current = null
      setSelectionRect({ visible: false, x: 0, y: 0, width: 0, height: 0 })
    },
    [selectionRect, design.layers, selectLayers, clearLayerSelection],
  )

  // Scroll do mouse DESABILITADO - apenas scroll vertical nativo
  // Zoom funciona apenas via botões e atalhos (Cmd/Ctrl +/-)
  const handleWheel = React.useCallback(
    (_event: KonvaEventObject<WheelEvent>) => {
      // NÃO prevenir default - permitir scroll vertical nativo
      // NÃO fazer zoom com scroll do mouse
      return
    },
    [],
  )


  // Zoom animado para atalhos de teclado
  // Desktop: mantém canvas centralizado horizontalmente
  // Mobile: margem fixa de 16px
  const animateZoom = React.useCallback(
    (newScale: number, duration = 300) => {
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stage.scaleX()

      // Clampar escala aos limites
      const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale))
      if (clampedScale === oldScale) return

      // Obter dimensões do stage (container)
      const stageWidth = stage.width()

      // Dimensões do canvas escalado
      const scaledCanvasWidth = canvasWidth * clampedScale

      let newX = 0
      const newY = 0

      if (isMobile) {
        // MOBILE: Margem fixa de 16px
        newX = 16
      } else {
        // DESKTOP: Centralizar se cabe na tela
        if (scaledCanvasWidth < stageWidth) {
          newX = (stageWidth - scaledCanvasWidth) / 2
        } else {
          newX = 0
        }
      }

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
    [setZoom, canvasWidth, isMobile],
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

  // Rastreia o gesto atual para o comportamento de grupo estilo Canva:
  // 1º clique seleciona o grupo inteiro; clique seguinte entra no elemento.
  // (mousedown e click do mesmo gesto disparam onSelect duas vezes)
  const selectGestureRef = React.useRef<{ layerId: string; groupWasSelected: boolean } | null>(null)

  const handleLayerSelect = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>, layer: Layer) => {
      event.cancelBubble = true
      const additive = !!(event.evt && (event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey))
      if (additive) {
        selectLayer(layer.id, { additive: true, toggle: true })
        return
      }

      const groupId = typeof layer.metadata?.groupId === 'string' ? layer.metadata.groupId : null
      const groupIds = groupId
        ? design.layers.filter((item) => item.metadata?.groupId === groupId).map((item) => item.id)
        : []
      const isGrouped = groupIds.length > 1
      // event.type é o nome do evento Konva ('click', 'mousedown', 'dragstart');
      // event.evt.type seria o nativo (o 'click' do Konva chega com evt 'mouseup')
      const evtType = event.type ?? event.evt?.type ?? ''
      const isClickPhase = evtType === 'click' || evtType === 'tap'

      if (!isGrouped) {
        selectLayer(layer.id)
        return
      }

      if (!isClickPhase) {
        // Fase mousedown/dragstart do gesto
        const groupFullySelected = groupIds.every((id) => selectedLayerIds.includes(id))
        const anySelected = groupIds.some((id) => selectedLayerIds.includes(id))
        selectGestureRef.current = { layerId: layer.id, groupWasSelected: groupFullySelected }
        if (groupFullySelected) {
          // Mantém o grupo selecionado — permite arrastar em conjunto;
          // o drill-in acontece na fase de click (se não houver drag)
          return
        }
        if (anySelected) {
          // Já "dentro" do grupo: seleção direta do elemento clicado
          selectLayer(layer.id)
          return
        }
        selectLayers(groupIds)
        return
      }

      // Fase click (só dispara se não houve drag): entra no elemento
      // individual quando o grupo já estava selecionado antes do gesto
      if (selectGestureRef.current?.layerId === layer.id && selectGestureRef.current.groupWasSelected) {
        selectLayer(layer.id)
      }
      selectGestureRef.current = null
    },
    [selectLayer, selectLayers, selectedLayerIds, design.layers],
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
        const MARGIN = CANVAS_MARGIN
        // Adicionar guias de margem como se fossem objetos invisíveis
        otherRects.push(
          { id: 'margin-left', x: MARGIN, y: 0, width: 0, height: canvasHeight },
          { id: 'margin-right', x: canvasWidth - MARGIN, y: 0, width: 0, height: canvasHeight },
          { id: 'margin-top', x: 0, y: MARGIN, width: canvasWidth, height: 0 },
          { id: 'margin-bottom', x: 0, y: canvasHeight - MARGIN, width: canvasWidth, height: 0 },
        )
      }

      // Usar a biblioteca otimizada de smart guides com configuração ativa.
      // Threshold é em pixels de TELA: em zoom baixo o valor bruto (5px do
      // canvas) ficava imperceptível, em zoom alto ficava grudento demais.
      const activeConfig = {
        ...snapConfig,
        enabled: snappingEnabled,
        threshold: snapConfig.threshold / (zoom || 1),
      }
      const { guides: nextGuides, position } = computeAlignmentGuides(
        movingRect,
        otherRects,
        canvasWidth,
        canvasHeight,
        activeConfig,
      )

      // Debug: verificar se guias estão sendo computadas (desabilitado)
      // if (nextGuides.length > 0) {
      //   console.log('🎯 Smart Guides detectadas:', nextGuides)
      // }

      if (position.x !== movingRect.x || position.y !== movingRect.y) {
        node.position(position)
      }

      // Seleção múltipla (ex.: grupo de combinação de fontes): move as demais
      // layers selecionadas junto, mantendo o deslocamento relativo.
      // node.isDragging() filtra chamadas atrasadas do throttle pós-dragend,
      // que reaplicariam o delta sobre posições já persistidas
      if (node.isDragging() && selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id)) {
        const stage = node.getStage()
        const deltaX = node.x() - (layer.position?.x ?? 0)
        const deltaY = node.y() - (layer.position?.y ?? 0)
        for (const id of selectedLayerIds) {
          if (id === layer.id) continue
          const other = design.layers.find((item) => item.id === id)
          const otherNode = stage?.findOne(`#${id}`)
          if (other && otherNode) {
            otherNode.position({
              x: (other.position?.x ?? 0) + deltaX,
              y: (other.position?.y ?? 0) + deltaY,
            })
          }
        }
      }

      setGuides(nextGuides)
    },
    [canvasHeight, canvasWidth, design.layers, snapConfig, snappingEnabled, showMarginGuides, selectedLayerIds, zoom],
  )

  const handleLayerDragEnd = React.useCallback(() => {
    setGuides([])
    // Persiste as posições das demais layers movidas no arraste em grupo
    // (a layer arrastada é gravada pelo próprio KonvaLayerFactory)
    if (selectedLayerIds.length > 1) {
      const stage = stageRef.current
      if (!stage) return
      // Um gesto = um passo de undo, mesmo persistindo N camadas
      const coalesceKey = `group-drag:${Date.now()}`
      for (const id of selectedLayerIds) {
        const layer = design.layers.find((item) => item.id === id)
        const node = stage.findOne(`#${id}`)
        if (!layer || !node) continue
        const nextX = Math.round(node.x())
        const nextY = Math.round(node.y())
        if (nextX !== Math.round(layer.position?.x ?? 0) || nextY !== Math.round(layer.position?.y ?? 0)) {
          updateLayer(id, (prev) => ({ ...prev, position: { x: nextX, y: nextY } }), { coalesceKey })
        }
      }
    }
  }, [selectedLayerIds, design.layers, updateLayer])

  // Atalhos de teclado para zoom, copy/paste, undo/redo
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      // Modo de recorte: Enter/Esc pertencem ao overlay; setas/atalhos não
      // podem mexer na camada por baixo
      if (croppingLayerId) return

      const key = event.key.toLowerCase()
      const isModifier = event.metaKey || event.ctrlKey

      // Desabilitar snap temporariamente com Alt
      if (key === 'alt') {
        setSnappingEnabled(false)
        setGuides([])
        return
      }

      // Toggle guias de margem com 'r'
      if (key === 'r' && !isModifier) {
        setShowMarginGuides(prev => !prev)
        return
      }

      // Toggle canvas bounds com 'c'
      if (key === 'c' && !isModifier) {
        setShowCanvasBounds(prev => !prev)
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

      // Alignment shortcuts (Shift+Ctrl+...)
      if (event.shiftKey) {
        if (key === 'l') {
          event.preventDefault()
          alignSelectedLeft()
          return
        }
        if (key === 'c') {
          event.preventDefault()
          alignSelectedCenterH()
          return
        }
        if (key === 'r') {
          event.preventDefault()
          alignSelectedRight()
          return
        }
        if (key === 't') {
          event.preventDefault()
          alignSelectedTop()
          return
        }
        if (key === 'm') {
          event.preventDefault()
          alignSelectedMiddleV()
          return
        }
        if (key === 'b') {
          event.preventDefault()
          alignSelectedBottom()
          return
        }
        if (key === 'h') {
          event.preventDefault()
          distributeSelectedH()
          return
        }
        if (key === 'v') {
          event.preventDefault()
          distributeSelectedV()
          return
        }

        // Layer ordering with Shift
        if (key === ']') {
          event.preventDefault()
          moveSelectedForward()
          return
        }
        if (key === '[') {
          event.preventDefault()
          moveSelectedBackward()
          return
        }
      }

      // Layer ordering without Shift (Ctrl+] and Ctrl+[)
      if (key === ']') {
        event.preventDefault()
        bringSelectedToFront()
        return
      }
      if (key === '[') {
        event.preventDefault()
        sendSelectedToBack()
        return
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
  }, [
    animateZoom,
    canRedo,
    canUndo,
    copySelectedLayers,
    pasteLayers,
    redo,
    selectedLayerIds.length,
    undo,
    showMarginGuides,
    showCanvasBounds,
    croppingLayerId,
    alignSelectedLeft,
    alignSelectedCenterH,
    alignSelectedRight,
    alignSelectedTop,
    alignSelectedMiddleV,
    alignSelectedBottom,
    distributeSelectedH,
    distributeSelectedV,
    bringSelectedToFront,
    sendSelectedToBack,
    moveSelectedForward,
    moveSelectedBackward,
  ])

  // OTIMIZAÇÃO MOBILE: Pinch-to-zoom multi-touch
  const handleTouchMove = React.useCallback((e: KonvaEventObject<TouchEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    const touch1 = e.evt.touches[0]
    const touch2 = e.evt.touches[1]

    if (touch1 && touch2) {
      // Multi-touch detectado: pinch to zoom
      // Parar drag se estiver acontecendo
      if (stage.isDragging()) {
        stage.stopDrag()
      }

      const p1 = { x: touch1.clientX, y: touch1.clientY }
      const p2 = { x: touch2.clientX, y: touch2.clientY }

      const newCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      }

      const dist = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      )

      if (!lastCenterRef.current) {
        lastCenterRef.current = newCenter
        lastDistRef.current = dist
        return
      }

      // Calcular novo zoom baseado na distância entre os dedos
      const pointTo = {
        x: (newCenter.x - stage.x()) / stage.scaleX(),
        y: (newCenter.y - stage.y()) / stage.scaleY(),
      }

      const scale = (stage.scaleX() * dist) / lastDistRef.current
      const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale))

      setZoom(clampedScale)

      // Ajustar posição para manter o ponto focal
      const dx = newCenter.x - lastCenterRef.current.x
      const dy = newCenter.y - lastCenterRef.current.y

      const newPos = {
        x: newCenter.x - pointTo.x * clampedScale + dx,
        y: newCenter.y - pointTo.y * clampedScale + dy,
      }

      stage.position(newPos)
      stage.batchDraw()

      lastDistRef.current = dist
      lastCenterRef.current = newCenter
    }
  }, [setZoom])

  const handleTouchEnd = React.useCallback(() => {
    lastCenterRef.current = null
    lastDistRef.current = 0
  }, [])

  // Habilitar multi-touch para Konva
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      Konva.hitOnDragEnabled = true
    }
  }, [])

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
    <div
      className="h-full w-full bg-[#f5f5f5] dark:bg-[#1a1a1a] overflow-y-auto overflow-x-auto"
      style={{ padding: isMobile ? '0.5rem' : '2rem' }}
    >
      <div className={`flex ${isMobile ? 'justify-start' : 'justify-center'} min-h-full`}>
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          className="rounded-md shadow-2xl ring-1 ring-border/20"
          pixelRatio={window.devicePixelRatio || 2}
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
          onMouseMove={handleStagePointerMove}
          onTouchMove={(e) => {
            // Multi-touch tem prioridade
            if (e.evt.touches && e.evt.touches.length > 1) {
              handleTouchMove(e)
            } else {
              handleStagePointerMove(e)
            }
          }}
          onMouseUp={handleStagePointerUp}
          onTouchEnd={(e) => {
            handleTouchEnd()
            handleStagePointerUp(e)
          }}
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
              // No modo focar textos o fundo vai a escuro: com fundo branco e
              // texto branco não sobrava contraste para avaliar nada
              fill={focusTextMode ? '#141414' : design.canvas.backgroundColor ?? '#ffffff'}
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
                // Em modo de recorte o node original sai de cena — o overlay
                // mostra a imagem inteira com a janela por cima
                layer={layer.id === croppingLayerId ? { ...layer, visible: false } : layer}
                disableInteractions={croppingLayerId !== null}
                dimmed={focusTextMode && layer.type !== 'text'}
                onSelect={(event) => handleLayerSelect(event, layer)}
                onChange={(updates) => handleLayerChange(layer.id, updates)}
                onDragMove={(event) => handleLayerDragMove(event, layer)}
                onDragEnd={handleLayerDragEnd}
                stageRef={stageRef}
                projectId={projectId}
              />
            ))}
            <KonvaSelectionTransformer
              selectedLayerIds={croppingLayerId ? [] : selectedLayerIds}
              stageRef={stageRef}
              snapEnabled={snappingEnabled}
              snapToMargins={showMarginGuides}
              onSnapGuides={setGuides}
            />
            <KonvaGradientHandles stageRef={stageRef} />
          </KonvaLayer>

          {/* Overlay de recorte de imagem (acima do conteúdo, abaixo das guias) */}
          {croppingLayerId && (
            <KonvaLayer name="crop-layer">
              <KonvaImageCropOverlay key={croppingLayerId} />
            </KonvaLayer>
          )}

          {/* Smart Guides layer - DEVE estar por último para aparecer na frente */}
          <KonvaLayer name="guides-layer" listening={false}>
            {/* {guides.length > 0 && console.log('🎨 Renderizando', guides.length, 'guias')} */}

            {/* Drag-to-select rectangle */}
            {selectionRect.visible && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(59, 130, 246, 0.2)"
                stroke="hsl(var(--primary))"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )}

            {/* Guias de margem (padding 70px) - Ativado com tecla 'R' */}
            {showMarginGuides && (
              <>
                {/* Borda esquerda - 70px */}
                <Line
                  points={[CANVAS_MARGIN, 0, CANVAS_MARGIN, canvasHeight]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda direita - 70px */}
                <Line
                  points={[canvasWidth - CANVAS_MARGIN, 0, canvasWidth - CANVAS_MARGIN, canvasHeight]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda superior - 70px */}
                <Line
                  points={[0, CANVAS_MARGIN, canvasWidth, CANVAS_MARGIN]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda inferior - 70px */}
                <Line
                  points={[0, canvasHeight - CANVAS_MARGIN, canvasWidth, canvasHeight - CANVAS_MARGIN]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}

            {guides.map((guide, index) => {
              const points = guide.orientation === 'vertical'
                ? [guide.position, 0, guide.position, canvasHeight]
                : [0, guide.position, canvasWidth, guide.position]

              // console.log(`📍 Guia ${index}:`, guide.orientation, 'pos:', guide.position, 'points:', points)

              return (
                <Line
                  key={`${guide.orientation}-${index}-${guide.position}`}
                  points={points}
                  stroke={snapConfig.guideColor}
                  strokeWidth={snapConfig.guideWidth}
                  dash={snapConfig.guideDash}
                  opacity={snapConfig.guideOpacity}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )
            })}

            {/* Canvas Bounds Guide Lines (Amarelas) - Toggle com tecla C */}
            {showCanvasBounds && (
              <>
                {/* Borda Esquerda */}
                <Line
                  points={[0, 0, 0, canvasHeight]}
                  stroke="#FFD700"
                  strokeWidth={3}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda Direita */}
                <Line
                  points={[canvasWidth, 0, canvasWidth, canvasHeight]}
                  stroke="#FFD700"
                  strokeWidth={3}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda Superior */}
                <Line
                  points={[0, 0, canvasWidth, 0]}
                  stroke="#FFD700"
                  strokeWidth={3}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda Inferior */}
                <Line
                  points={[0, canvasHeight, canvasWidth, canvasHeight]}
                  stroke="#FFD700"
                  strokeWidth={3}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}
          </KonvaLayer>
        </Stage>
      </div>
    </div>
  )
}
