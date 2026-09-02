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
import { KonvaInstagramStoryMask } from './konva-instagram-story-mask'
import {
  computeAlignmentGuides,
  type RectInfo,
  type GuideLine,
  type SnapConfig,
  DEFAULT_SNAP_CONFIG,
} from '@/lib/konva-smart-guides'
import { CANVAS_MARGIN } from '@/lib/canvas-margin'
import { decidirSelecaoPorGesto, type FaseDoGesto, type GestoDeSelecao } from '@/lib/selecao-por-gesto'
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

interface KonvaEditorStageProps {
  /**
   * Modo embutido (workspace contínuo): o stage vive num slot da coluna de
   * páginas — sem container de scroll próprio, dimensionado já escalado
   * (width×zoom por height×zoom) e sem os efeitos de centralização/auto-fit
   * (a coluna centraliza via CSS e é dona do scroll).
   */
  embedded?: boolean
}

export function KonvaEditorStage({ embedded = false }: KonvaEditorStageProps = {}) {
  const {
    projectId,
    design,
    selectedLayerIds,
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
  // Máscara com a interface do story do Instagram ('M'): referência de
  // diagramação, ligada por padrão — o chrome cabe dentro das margens de
  // segurança, então não atrapalha quem está editando
  const [showInstagramMask, setShowInstagramMask] = React.useState(true)
  const [_fontsReady, setFontsReady] = React.useState(false)

  // Retângulo de seleção (marquee). Vive em coordenadas do CANVAS, as mesmas
  // das camadas — nunca em pixels do contêiner: o stage é escalado pelo zoom,
  // e um Rect desenhado com a posição bruta do ponteiro aparecia a 60% do
  // caminho em zoom 60% (medido: mouse em 60,60 → retângulo em 36,36). O
  // retângulo não acompanhava o mouse e o gesto parecia não existir.
  const [selectionRect, setSelectionRect] = React.useState<{
    visible: boolean
    x: number
    y: number
    width: number
    height: number
  }>({ visible: false, x: 0, y: 0, width: 0, height: 0 })
  const selectionStartRef = React.useRef<{ x: number; y: number } | null>(null)
  // Espelho do estado para os handlers de window (sem closure velha)
  const selectionRectRef = React.useRef(selectionRect)
  selectionRectRef.current = selectionRect
  // O Konva só entrega mouseup/mousemove enquanto o ponteiro está SOBRE o
  // stage — e no workspace contínuo o stage tem o tamanho exato da página.
  // Soltar o mouse fora dela deixava o retângulo pendurado e a seleção nunca
  // era aplicada. Os listeners de window fecham o gesto onde quer que solte.
  const marqueeWindowRef = React.useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void } | null>(null)

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

  React.useEffect(() => {
    if (stageRef.current) {
      setStageInstance(stageRef.current)
    }
    return () => setStageInstance(null)
  }, [setStageInstance])

  // MOBILE: Calcular zoom inicial para caber na tela
  React.useEffect(() => {
    if (!isMobile || embedded) return

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
  }, [isMobile, embedded, canvasWidth, canvasHeight, setZoom])

  // DESKTOP: Resize Observer para recentralizar quando o container mudar
  React.useEffect(() => {
    if (isMobile || embedded) return

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
  }, [isMobile, embedded, canvasWidth])

  // Sincronizar estado zoom com Konva stage.scale()
  // Desktop: mantém canvas centralizado horizontalmente
  // Mobile: aplica zoom mantendo margem fixa
  // Embutido: o zoom entra por props do Stage (width/height/scale) — nada aqui
  React.useEffect(() => {
    if (embedded) return
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
  }, [zoom, canvasWidth, canvasHeight, isMobile, embedded])

  /** Estende o retângulo até o ponto (em coordenadas do canvas) */
  const atualizarMarquee = React.useCallback((ponto: { x: number; y: number }) => {
    const start = selectionStartRef.current
    if (!start) return
    setSelectionRect({
      visible: true,
      x: Math.min(start.x, ponto.x),
      y: Math.min(start.y, ponto.y),
      width: Math.abs(ponto.x - start.x),
      height: Math.abs(ponto.y - start.y),
    })
  }, [])

  const soltarListenersDeMarquee = React.useCallback(() => {
    const listeners = marqueeWindowRef.current
    if (!listeners) return
    window.removeEventListener('mousemove', listeners.move)
    window.removeEventListener('mouseup', listeners.up)
    marqueeWindowRef.current = null
  }, [])

  /** Fecha o gesto: aplica a seleção do que o retângulo pegou e o esconde */
  const finalizarMarquee = React.useCallback(
    (stage: Konva.Stage, evt: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } | null | undefined) => {
      if (!selectionStartRef.current) return
      selectionStartRef.current = null
      soltarListenersDeMarquee()

      const box = selectionRectRef.current
      // Sem arrasto é um clique no vazio: não pega nada (um retângulo 0×0
      // "intersecta" a caixa de quem estiver embaixo do ponteiro)
      const ehClique = box.width < 2 && box.height < 2

      const selectedIds: string[] = []
      if (!ehClique) {
        for (const layer of design.layers) {
          const node = stage.findOne(`#${layer.id}`)
          if (!node) continue
          // relativeTo: stage → caixa do nó no espaço do canvas, o mesmo do retângulo
          const nodeBox = node.getClientRect({ relativeTo: stage })
          if (Konva.Util.haveIntersection(box, nodeBox)) selectedIds.push(layer.id)
        }
      }

      // Grupo estilo Canva entra inteiro: pegar um membro no retângulo puxa
      // os irmãos (mesmo groupId)
      const groupIds = new Set(
        selectedIds
          .map((id) => design.layers.find((layer) => layer.id === id)?.metadata?.groupId)
          .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.length > 0),
      )
      if (groupIds.size > 0) {
        for (const layer of design.layers) {
          const groupId = layer.metadata?.groupId
          if (typeof groupId === 'string' && groupIds.has(groupId) && !selectedIds.includes(layer.id)) {
            selectedIds.push(layer.id)
          }
        }
      }

      // Com Shift/Cmd/Ctrl o retângulo ACRESCENTA à seleção (mesma regra do
      // clique); sem nada dentro dele, a seleção atual fica como está
      const additive = !!(evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey))
      if (selectedIds.length > 0) {
        selectLayers(additive ? [...selectedLayerIds, ...selectedIds] : selectedIds)
      } else if (!additive) {
        clearLayerSelection()
      }

      setSelectionRect({ visible: false, x: 0, y: 0, width: 0, height: 0 })
    },
    [design.layers, selectedLayerIds, selectLayers, clearLayerSelection, soltarListenersDeMarquee],
  )
  // Os listeners de window são registrados na descida e viveriam com a versão
  // de então; o ref garante que a finalização use as camadas/seleção atuais
  const finalizarMarqueeRef = React.useRef(finalizarMarquee)
  finalizarMarqueeRef.current = finalizarMarquee

  React.useEffect(() => soltarListenersDeMarquee, [soltarListenersDeMarquee])

  const handleStagePointerDown = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Modo de recorte: o overlay é dono de todos os gestos (nada de marquee)
      if (croppingLayerId) return
      const stage = event.target.getStage()
      if (!stage) return

      const target = event.target as Konva.Node
      const clickedOnEmpty = target === stage || target.hasName?.('canvas-background')
      if (!clickedOnEmpty) return

      // Posição no espaço do canvas (inverso da transformação do stage)
      const ponto = stage.getRelativePointerPosition()
      if (!ponto) return

      soltarListenersDeMarquee()
      selectionStartRef.current = { x: ponto.x, y: ponto.y }
      setSelectionRect({ visible: true, x: ponto.x, y: ponto.y, width: 0, height: 0 })

      // Mouse: acompanha e fecha pelo window, para o gesto sobreviver a sair
      // do stage. Toque fica com os handlers do próprio stage.
      if (typeof MouseEvent !== 'undefined' && event.evt instanceof MouseEvent) {
        const move = (e: MouseEvent) => {
          stage.setPointersPositions(e)
          const p = stage.getRelativePointerPosition()
          if (p) atualizarMarquee(p)
        }
        const up = (e: MouseEvent) => finalizarMarqueeRef.current(stage, e)
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        marqueeWindowRef.current = { move, up }
      }
    },
    [croppingLayerId, atualizarMarquee, soltarListenersDeMarquee],
  )

  const handleStagePointerMove = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!selectionStartRef.current) return
      const stage = event.target.getStage()
      const ponto = stage?.getRelativePointerPosition()
      if (ponto) atualizarMarquee(ponto)
    },
    [atualizarMarquee],
  )

  const handleStagePointerUp = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = event.target.getStage()
      if (!stage) return
      finalizarMarquee(stage, event.evt)
    },
    [finalizarMarquee],
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

      // No modo embutido quem escala é o React (props scaleX/scaleY do <Stage>)
      // e quem posiciona é o slot da coluna. Animar `stage.position()` aqui
      // deslocaria o desenho dentro do slot sem nada repor — o <Stage> não
      // declara props x/y — e o `onUpdate` re-renderizaria a coluna inteira a
      // cada frame. Só mexe no zoom global; o workspace ancora o scroll.
      if (embedded) {
        setZoom(clampedScale)
        return
      }

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
    [setZoom, canvasWidth, isMobile, embedded],
  )

  // Chave de coalescência do arraste em grupo: a camada arrastada persiste a
  // própria posição pelo factory (onChange), as demais pelo handleLayerDragEnd
  // e as que o Transformer "puxa" (startDrag proxy) persistem cada uma pelo
  // seu factory — sem uma chave comum, UM arraste virava três passos de undo
  const groupDragKeyRef = React.useRef<string | null>(null)

  const handleLayerChange = React.useCallback(
    (layerId: string, updates: Partial<Layer>) => {
      updateLayer(
        layerId,
        (current) => ({
          ...current,
          ...updates,
          position: updates.position ? { ...current.position, ...updates.position } : current.position,
          size: updates.size ? { ...current.size, ...updates.size } : current.size,
          style: updates.style ? { ...current.style, ...updates.style } : current.style,
        }),
        { coalesceKey: groupDragKeyRef.current ?? undefined },
      )
    },
    [updateLayer],
  )

  // Um gesto do ponteiro chama onSelect mais de uma vez (mousedown/touchstart
  // e depois dragstart OU click/tap). Quem decide a seleção — uma única vez,
  // na descida — é a máquina de estados pura de `selecao-por-gesto.ts`; aqui
  // só se traduz o evento Konva e se aplica o resultado. O gesto em andamento
  // fica neste ref entre as fases.
  const selectGestureRef = React.useRef<GestoDeSelecao | null>(null)

  const handleLayerSelect = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>, layer: Layer) => {
      event.cancelBubble = true
      // event.type é o nome do evento Konva ('click', 'mousedown', 'dragstart');
      // event.evt.type seria o nativo (o 'click' do Konva chega com evt 'mouseup')
      const evtType = event.type ?? event.evt?.type ?? ''
      const phase: FaseDoGesto =
        evtType === 'click' || evtType === 'tap' ? 'click' : evtType === 'dragstart' ? 'drag' : 'down'
      const additive = !!(event.evt && (event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey))

      if (phase === 'drag' && selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id) && !groupDragKeyRef.current) {
        groupDragKeyRef.current = `group-drag:${Date.now()}`
      }

      const groupId = typeof layer.metadata?.groupId === 'string' ? layer.metadata.groupId : null
      const groupIds = groupId
        ? design.layers.filter((item) => item.metadata?.groupId === groupId).map((item) => item.id)
        : []

      const resultado = decidirSelecaoPorGesto({
        phase,
        additive,
        layerId: layer.id,
        groupIds,
        selection: selectedLayerIds,
        gesture: selectGestureRef.current,
      })
      selectGestureRef.current = resultado.gesture
      if (resultado.selection) selectLayers(resultado.selection)
    },
    [selectLayers, selectedLayerIds, design.layers],
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
        // Adicionar guias de margem como se fossem objetos invisíveis
        otherRects.push(
          { id: 'margin-left', x: CANVAS_MARGIN.left, y: 0, width: 0, height: canvasHeight },
          { id: 'margin-right', x: canvasWidth - CANVAS_MARGIN.right, y: 0, width: 0, height: canvasHeight },
          { id: 'margin-top', x: 0, y: CANVAS_MARGIN.top, width: canvasWidth, height: 0 },
          { id: 'margin-bottom', x: 0, y: canvasHeight - CANVAS_MARGIN.bottom, width: canvasWidth, height: 0 },
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
      // Um gesto = um passo de undo, mesmo persistindo N camadas. A mesma
      // chave já foi usada pelo onChange da camada arrastada; as camadas que
      // o Transformer puxou ainda vão disparar o próprio dragend (síncrono,
      // logo depois deste), por isso a chave só é solta no próximo tick.
      const coalesceKey = groupDragKeyRef.current ?? `group-drag:${Date.now()}`
      groupDragKeyRef.current = coalesceKey
      setTimeout(() => {
        if (groupDragKeyRef.current === coalesceKey) groupDragKeyRef.current = null
      }, 0)
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

      // Toggle máscara da interface do Instagram com 'm'
      if (key === 'm' && !isModifier) {
        setShowInstagramMask(prev => !prev)
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

  // Embutido: o slot da coluna já tem o tamanho escalado — o stage nasce
  // pequeno (buffer proporcional ao que aparece na tela, não à página bruta)
  const scaledWidth = Math.max(1, Math.round(canvasWidth * zoom))
  const scaledHeight = Math.max(1, Math.round(canvasHeight * zoom))

  /**
   * Folga em volta da página enquanto o recorte está aberto (só no modo
   * embutido).
   *
   * O stage embutido tem o tamanho EXATO da página, então a foto inteira — que
   * quase sempre é maior que a moldura — era cortada na borda do canvas e o
   * usuário não via o que sobrava para cada lado. Com a folga o stage passa a
   * desenhar além da página; o overlay esmaece essa área e a foto aparece
   * inteira. No modo clássico não é preciso: lá o stage já é do tamanho do
   * container.
   */
  const cropMargin =
    embedded && croppingLayerId
      ? Math.round(Math.max(canvasWidth, canvasHeight) * 0.35 * zoom)
      : 0

  const stageElement = (
        <Stage
          ref={stageRef}
          width={embedded ? scaledWidth + cropMargin * 2 : canvasWidth}
          height={embedded ? scaledHeight + cropMargin * 2 : canvasHeight}
          x={embedded ? cropMargin : undefined}
          y={embedded ? cropMargin : undefined}
          scaleX={embedded ? zoom : undefined}
          scaleY={embedded ? zoom : undefined}
          // Com folga, a moldura arredondada e a sombra são da PÁGINA, não da
          // área expandida — o fundo da página já desenha o canto arredondado
          className={cropMargin ? undefined : 'rounded-md shadow-2xl ring-1 ring-border/20'}
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

            {/* Máscara da interface do story ('M') — primeira do grupo para as
                guias de margem ficarem por cima do gradiente */}
            {showInstagramMask && (
              <KonvaInstagramStoryMask
                projectId={projectId}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
              />
            )}

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

            {/* Guias de margem (70px laterais, 120px topo, 100px base) - Ativado com tecla 'R' */}
            {showMarginGuides && (
              <>
                {/* Borda esquerda */}
                <Line
                  points={[CANVAS_MARGIN.left, 0, CANVAS_MARGIN.left, canvasHeight]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda direita */}
                <Line
                  points={[canvasWidth - CANVAS_MARGIN.right, 0, canvasWidth - CANVAS_MARGIN.right, canvasHeight]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda superior */}
                <Line
                  points={[0, CANVAS_MARGIN.top, canvasWidth, CANVAS_MARGIN.top]}
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dash={[6, 4]}
                  opacity={0.8}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                {/* Borda inferior */}
                <Line
                  points={[0, canvasHeight - CANVAS_MARGIN.bottom, canvasWidth, canvasHeight - CANVAS_MARGIN.bottom]}
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
  )

  if (embedded) {
    return (
      <div className="relative" style={{ width: scaledWidth, height: scaledHeight }}>
        {cropMargin ? (
          // O slot da coluna mantém o tamanho da página: a área extra do stage
          // transborda por cima do resto do workspace, em vez de empurrar as
          // páginas vizinhas
          <div style={{ position: 'absolute', left: -cropMargin, top: -cropMargin, zIndex: 30 }}>
            {stageElement}
          </div>
        ) : (
          stageElement
        )}
      </div>
    )
  }

  return (
    <div
      className="h-full w-full bg-[#f5f5f5] dark:bg-[#1a1a1a] overflow-y-auto overflow-x-auto"
      style={{ padding: isMobile ? '0.5rem' : '2rem' }}
    >
      <div className={`flex ${isMobile ? 'justify-start' : 'justify-center'} min-h-full`}>
        {stageElement}
      </div>
    </div>
  )
}
