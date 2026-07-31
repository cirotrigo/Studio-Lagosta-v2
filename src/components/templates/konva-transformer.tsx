"use client"

import * as React from 'react'
import Konva from 'konva'
import { Transformer } from 'react-konva'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { CANVAS_MARGIN } from '@/lib/canvas-margin'
import type { GuideLine } from '@/lib/konva-smart-guides'

interface KonvaSelectionTransformerProps {
  selectedLayerIds: string[]
  stageRef: React.RefObject<Konva.Stage | null>
  /** Snap das bordas durante o resize (mesmas guias do drag) */
  snapEnabled?: boolean
  /** Incluir as margens de segurança (CANVAS_MARGIN) como alvo de snap */
  snapToMargins?: boolean
  /** Recebe as guias a desenhar durante o resize (mesma layer de guias do drag) */
  onSnapGuides?: (guides: GuideLine[]) => void
}

export function KonvaSelectionTransformer({
  selectedLayerIds,
  stageRef,
  snapEnabled = true,
  snapToMargins = true,
  onSnapGuides,
}: KonvaSelectionTransformerProps) {
  const transformerRef = React.useRef<Konva.Transformer | null>(null)
  const { design } = useTemplateEditor()
  const [isShiftPressed, setIsShiftPressed] = React.useState(false)

  // Refs para o boundBoxFunc (callback vive fora do ciclo de render)
  const snapDataRef = React.useRef({
    enabled: snapEnabled,
    margins: snapToMargins,
    canvasWidth: design.canvas.width,
    canvasHeight: design.canvas.height,
    layers: design.layers,
    selectedIds: selectedLayerIds,
    keepRatio: false,
  })
  snapDataRef.current.enabled = snapEnabled
  snapDataRef.current.margins = snapToMargins
  snapDataRef.current.canvasWidth = design.canvas.width
  snapDataRef.current.canvasHeight = design.canvas.height
  snapDataRef.current.layers = design.layers
  snapDataRef.current.selectedIds = selectedLayerIds

  const onSnapGuidesRef = React.useRef(onSnapGuides)
  onSnapGuidesRef.current = onSnapGuides

  React.useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current ?? transformer?.getStage()
    if (!transformer || !stage) return

    if (!selectedLayerIds.length) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    // Layers recém-adicionadas podem ainda não estar no stage (render adiado
    // via useDeferredValue e fontes carregando) — tenta resolver por alguns
    // frames até todos os nós selecionados existirem
    let rafId = 0
    let attempts = 0
    const resolveNodes = () => {
      const nodes = selectedLayerIds
        .map((id) => stage.findOne(`#${id}`))
        .filter((node): node is Konva.Node => Boolean(node))

      transformer.nodes(nodes)
      transformer.getLayer()?.batchDraw()

      if (nodes.length < selectedLayerIds.length && attempts < 90) {
        attempts += 1
        rafId = requestAnimationFrame(resolveNodes)
      }
    }
    resolveNodes()

    return () => cancelAnimationFrame(rafId)
  }, [design.layers, selectedLayerIds, stageRef])

  // Limpar guias de snap ao fim do gesto de resize
  React.useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const clear = () => onSnapGuidesRef.current?.([])
    transformer.on('transformend.snapguides', clear)
    return () => {
      transformer.off('transformend.snapguides')
    }
  }, [])

  // Detectar Shift para preservar aspect ratio em elementos não-imagem
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !isShiftPressed) {
        setIsShiftPressed(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && isShiftPressed) {
        setIsShiftPressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isShiftPressed])

  // Atualizar keepRatio do transformer (Konva best practice: images always keep ratio)
  React.useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return

    // Check if any selected node is an image type
    const nodes = transformer.nodes()
    const hasImageNode = nodes.some((node) => {
      const layerId = node.id()
      const layer = design.layers.find((l) => l.id === layerId)
      return layer && (layer.type === 'image' || layer.type === 'logo' || layer.type === 'element')
    })

    // Images ALWAYS keep aspect ratio (Konva best practice)
    // Other elements only when Shift is pressed
    const keepRatio = hasImageNode || isShiftPressed
    transformer.keepRatio(keepRatio)
    snapDataRef.current.keepRatio = keepRatio
    transformer.getLayer()?.batchDraw()
  }, [isShiftPressed, design.layers, selectedLayerIds])

  const boundBoxFunc = React.useCallback(
    (oldBox: { x: number; y: number; width: number; height: number; rotation: number }, newBox: { x: number; y: number; width: number; height: number; rotation: number }) => {
      if (newBox.width < 5 || newBox.height < 5) {
        return oldBox
      }

      const snap = snapDataRef.current
      // Snap de resize: só para caixas sem rotação e sem keepRatio (snapar uma
      // borda de um node keepRatio quebraria a proporção que o Konva calculou)
      if (
        !snap.enabled ||
        snap.keepRatio ||
        Math.abs(newBox.rotation) > 0.001 ||
        Math.abs(oldBox.rotation) > 0.001
      ) {
        onSnapGuidesRef.current?.([])
        return newBox
      }

      const stage = stageRef.current ?? transformerRef.current?.getStage()
      if (!stage) return newBox

      const scale = stage.scaleX() || 1
      const stageX = stage.x()
      const stageY = stage.y()

      // boundBox chega em coordenadas absolutas do stage — converter para o
      // espaço do canvas, onde vivem as guias
      const box = {
        x: (newBox.x - stageX) / scale,
        y: (newBox.y - stageY) / scale,
        width: newBox.width / scale,
        height: newBox.height / scale,
      }
      const old = {
        x: (oldBox.x - stageX) / scale,
        y: (oldBox.y - stageY) / scale,
        width: oldBox.width / scale,
        height: oldBox.height / scale,
      }

      // Threshold em pixels de TELA (5px), convertido para unidades do canvas
      const threshold = 5 / scale
      const eps = 0.5 / scale

      // Alvos de snap: bordas/centro do canvas, margens de segurança e bordas
      // das demais camadas (centros ficam de fora — no resize só as bordas ajudam)
      const vStops: number[] = [0, snap.canvasWidth / 2, snap.canvasWidth]
      const hStops: number[] = [0, snap.canvasHeight / 2, snap.canvasHeight]
      if (snap.margins) {
        vStops.push(CANVAS_MARGIN.left, snap.canvasWidth - CANVAS_MARGIN.right)
        hStops.push(CANVAS_MARGIN.top, snap.canvasHeight - CANVAS_MARGIN.bottom)
      }
      for (const layer of snap.layers) {
        if (snap.selectedIds.includes(layer.id)) continue
        const x = layer.position?.x ?? 0
        const y = layer.position?.y ?? 0
        const w = Math.max(1, layer.size?.width ?? 0)
        const h = Math.max(1, layer.size?.height ?? 0)
        vStops.push(x, x + w)
        hStops.push(y, y + h)
      }

      const findStop = (value: number, stops: number[]): number | null => {
        let best: number | null = null
        let bestDiff = threshold
        for (const stop of stops) {
          const diff = Math.abs(stop - value)
          if (diff < bestDiff) {
            bestDiff = diff
            best = stop
          }
        }
        return best
      }

      const guides: GuideLine[] = []

      // Detectar quais bordas o gesto está movendo e snapar só essas,
      // mantendo a borda oposta fixa
      const leftMoving = Math.abs(box.x - old.x) > eps
      const rightMoving = Math.abs(box.x + box.width - (old.x + old.width)) > eps
      const topMoving = Math.abs(box.y - old.y) > eps
      const bottomMoving = Math.abs(box.y + box.height - (old.y + old.height)) > eps

      if (leftMoving && !rightMoving) {
        const stop = findStop(box.x, vStops)
        if (stop !== null) {
          const right = box.x + box.width
          box.x = stop
          box.width = right - stop
          guides.push({ orientation: 'vertical', position: stop, snapType: 'start' })
        }
      } else if (rightMoving && !leftMoving) {
        const stop = findStop(box.x + box.width, vStops)
        if (stop !== null) {
          box.width = stop - box.x
          guides.push({ orientation: 'vertical', position: stop, snapType: 'end' })
        }
      }

      if (topMoving && !bottomMoving) {
        const stop = findStop(box.y, hStops)
        if (stop !== null) {
          const bottom = box.y + box.height
          box.y = stop
          box.height = bottom - stop
          guides.push({ orientation: 'horizontal', position: stop, snapType: 'start' })
        }
      } else if (bottomMoving && !topMoving) {
        const stop = findStop(box.y + box.height, hStops)
        if (stop !== null) {
          box.height = stop - box.y
          guides.push({ orientation: 'horizontal', position: stop, snapType: 'end' })
        }
      }

      onSnapGuidesRef.current?.(guides)

      if (box.width * scale < 5 || box.height * scale < 5) {
        return oldBox
      }

      return {
        x: box.x * scale + stageX,
        y: box.y * scale + stageY,
        width: box.width * scale,
        height: box.height * scale,
        rotation: newBox.rotation,
      }
    },
    [stageRef],
  )

  return (
    <Transformer
      ref={transformerRef}
      rotateEnabled
      keepRatio={false} // Será controlado dinamicamente via effect
      borderStroke="hsl(var(--primary))"
      borderStrokeWidth={2}
      anchorStroke="hsl(var(--primary))"
      anchorFill="#ffffff"
      anchorSize={10}
      anchorCornerRadius={4}
      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
      rotateAnchorOffset={30}
      boundBoxFunc={boundBoxFunc}
    />
  )
}
