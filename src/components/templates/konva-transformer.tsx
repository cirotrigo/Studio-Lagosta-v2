"use client"

import * as React from 'react'
import Konva from 'konva'
import { Transformer } from 'react-konva'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { CANVAS_MARGIN, type LinhasDaMarca } from '@/lib/canvas-margin'
import { alcaDeCanto, encaixeProporcional, paradasDeEncaixe } from '@/lib/margens-no-editor'
import type { GuideLine } from '@/lib/konva-smart-guides'
import { travaDeProporcao } from '@/lib/konva/trava-de-proporcao'
import { useAjustarGrade } from '@/hooks/use-ajustar-grade'
import { caixaPeloTransformer, modoDaSelecao } from '@/lib/grades/ajustes'
import { metadadoDeGrade } from '@/lib/grades/conferir'
import { membrosDaGrade } from '@/lib/grades/preenchimento'

interface KonvaSelectionTransformerProps {
  selectedLayerIds: string[]
  stageRef: React.RefObject<Konva.Stage | null>
  /** Snap das bordas durante o resize (mesmas guias do drag) */
  snapEnabled?: boolean
  /** Incluir a margem da marca como alvo de snap */
  snapToMargins?: boolean
  /** As linhas da margem da MARCA da página aberta (`margensDoEditor(...).marca`); sem elas, o padrão do Story. */
  margens?: LinhasDaMarca
  /** As guias manuais da página (L4) como paradas do encaixe; ausente = sem guias. */
  guias?: { v: number[]; h: number[] }
  /** Recebe as guias a desenhar durante o resize (mesma layer de guias do drag) */
  onSnapGuides?: (guides: GuideLine[]) => void
}

export function KonvaSelectionTransformer({
  selectedLayerIds,
  stageRef,
  snapEnabled = true,
  snapToMargins = true,
  margens,
  guias,
  onSnapGuides,
}: KonvaSelectionTransformerProps) {
  const transformerRef = React.useRef<Konva.Transformer | null>(null)
  const { design } = useTemplateEditor()
  const [isShiftPressed, setIsShiftPressed] = React.useState(false)

  // G3: grade inteira redimensiona como UMA caixa (sem girar); célula, subconjunto ou seleção mista com grade não tem
  // alça nenhuma — senão o Konva escalaria calhas e células uma a uma
  const { ajustar } = useAjustarGrade()
  const grade = React.useMemo(() => modoDaSelecao(design.layers, selectedLayerIds), [design.layers, selectedLayerIds])
  const gradeRef = React.useRef({ grade, layers: design.layers, ajustar })
  gradeRef.current = { grade, layers: design.layers, ajustar }

  // Fim do gesto na grade inteira: o Konva já escalou e moveu os nós; eles voltam NA HORA (escala 1, lugar do estado),
  // com ou sem recusa, e a grade é refeita UMA vez pela caixa nova (calhas fixas em px) num desfazer
  React.useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    transformer.on('transformend.grade', () => {
      const { grade: sel, layers, ajustar: refazer } = gradeRef.current
      if (sel.modo !== 'inteira' || !sel.gradeId) return
      const membros = membrosDaGrade(layers, sel.gradeId)
      const nos = transformer.nodes()
      // `antes`: onde o nó estava no estado (a margem da grade quadrada entre caixa e nós escala junto)
      const medidos = nos.map((n) => ({ x: n.x(), y: n.y(), scaleX: n.scaleX(), scaleY: n.scaleY(), antes: membros.find((m) => m.id === n.id())?.position }))
      for (const n of nos) {
        const camada = membros.find((m) => m.id === n.id())
        n.scaleX(1)
        n.scaleY(1)
        if (camada) {
          n.position({ x: camada.position.x, y: camada.position.y })
          n.rotation(camada.rotation ?? 0)
        }
      }
      transformer.getLayer()?.batchDraw()
      const meta = membros[0] ? metadadoDeGrade(membros[0]) : undefined
      const caixa = meta ? caixaPeloTransformer(meta.caixa, medidos) : undefined
      if (caixa) void refazer(sel.gradeId, { caixa })
    })
    return () => {
      transformer.off('transformend.grade')
    }
  }, [])

  // Refs para o boundBoxFunc (callback vive fora do ciclo de render)
  const snapDataRef = React.useRef({
    enabled: snapEnabled,
    margins: snapToMargins,
    canvasWidth: design.canvas.width,
    canvasHeight: design.canvas.height,
    layers: design.layers,
    selectedIds: selectedLayerIds,
    keepRatio: false,
    margensDaMarca: margens,
    guias,
  })
  snapDataRef.current.enabled = snapEnabled
  snapDataRef.current.margins = snapToMargins
  snapDataRef.current.margensDaMarca = margens
  snapDataRef.current.guias = guias
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

  // keepRatio e alças pela seleção (src/lib/konva/trava-de-proporcao): imagem sempre
  // proporcional; forma com style.manterProporcao proporcional e só pelos cantos;
  // o resto só com Shift
  const trava = React.useMemo(
    () => travaDeProporcao(design.layers, selectedLayerIds, isShiftPressed),
    [design.layers, selectedLayerIds, isShiftPressed],
  )
  React.useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    transformer.keepRatio(trava.keepRatio)
    snapDataRef.current.keepRatio = trava.keepRatio
    transformer.getLayer()?.batchDraw()
  }, [trava])

  const boundBoxFunc = React.useCallback(
    (oldBox: { x: number; y: number; width: number; height: number; rotation: number }, newBox: { x: number; y: number; width: number; height: number; rotation: number }) => {
      if (newBox.width < 5 || newBox.height < 5) {
        return oldBox
      }

      const snap = snapDataRef.current
      // Snap de resize: só para caixas sem rotação. Com keepRatio (foto, logo, elemento) o canto arrastado encaixa
      // no eixo que mais anda e o outro segue a proporção (L3 das linhas-guia; antes não encaixava)
      if (!snap.enabled || Math.abs(newBox.rotation) > 0.001 || Math.abs(oldBox.rotation) > 0.001) {
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
        const paradas = paradasDeEncaixe(
          snap.margensDaMarca ?? { topo: CANVAS_MARGIN.top, base: snap.canvasHeight - CANVAS_MARGIN.bottom, esquerda: CANVAS_MARGIN.left, direita: snap.canvasWidth - CANVAS_MARGIN.right },
        )
        vStops.push(...paradas.v)
        hStops.push(...paradas.h)
      }
      if (snap.guias) {
        vStops.push(...snap.guias.v)
        hStops.push(...snap.guias.h)
      }
      for (const layer of snap.layers) {
        if (snap.selectedIds.includes(layer.id) || layer.visible === false) continue
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

      // Com proporção travada só a alça de CANTO muda os dois eixos; a lateral muda um só (recorte da janela da
      // foto) e segue o encaixe de borda de sempre (Codex R1 do L3)
      if (snap.keepRatio && alcaDeCanto(transformerRef.current?.getActiveAnchor())) {
        const r = encaixeProporcional(old, box, { v: vStops, h: hStops }, threshold, eps)
        onSnapGuidesRef.current?.(r ? [r.guia] : [])
        const c = r?.caixa ?? box
        if (c.width * scale < 5 || c.height * scale < 5) return oldBox
        return { x: c.x * scale + stageX, y: c.y * scale + stageY, width: c.width * scale, height: c.height * scale, rotation: newBox.rotation }
      }

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
      rotateEnabled={grade.modo === 'nenhuma'}
      keepRatio={false} // Será controlado dinamicamente via effect
      borderStroke="hsl(var(--primary))"
      borderStrokeWidth={2}
      anchorStroke="hsl(var(--primary))"
      anchorFill="#ffffff"
      anchorSize={10}
      anchorCornerRadius={4}
      enabledAnchors={grade.modo === 'parcial' ? [] : trava.ancoras}
      rotateAnchorOffset={30}
      boundBoxFunc={boundBoxFunc}
    />
  )
}
