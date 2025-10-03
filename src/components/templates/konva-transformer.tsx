"use client"

import * as React from 'react'
import Konva from 'konva'
import { Transformer } from 'react-konva'
import { useTemplateEditor } from '@/contexts/template-editor-context'

interface KonvaSelectionTransformerProps {
  selectedLayerIds: string[]
  stageRef: React.RefObject<Konva.Stage | null>
}

export function KonvaSelectionTransformer({ selectedLayerIds, stageRef }: KonvaSelectionTransformerProps) {
  const transformerRef = React.useRef<Konva.Transformer | null>(null)
  const { design } = useTemplateEditor()
  const [isShiftPressed, setIsShiftPressed] = React.useState(false)

  React.useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current ?? transformer?.getStage()
    if (!transformer || !stage) return

    if (!selectedLayerIds.length) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    const nodes = selectedLayerIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((node): node is Konva.Node => Boolean(node))

    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [design.layers, selectedLayerIds, stageRef])

  // Detectar Shift para preservar aspect ratio
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

  // Atualizar keepRatio do transformer quando Shift mudar
  React.useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return

    // Para imagens, sempre manter proporção por padrão
    const nodes = transformer.nodes()
    const hasImageNode = nodes.some((node) => {
      const layerId = node.id()
      const layer = design.layers.find((l) => l.id === layerId)
      return layer && (layer.type === 'image' || layer.type === 'logo' || layer.type === 'element')
    })

    // Imagens sempre mantêm proporção, outros elementos só com Shift
    transformer.keepRatio(hasImageNode || isShiftPressed)
    transformer.getLayer()?.batchDraw()
  }, [isShiftPressed, design.layers, selectedLayerIds])

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
      boundBoxFunc={(oldBox, newBox) => {
        if (newBox.width < 5 || newBox.height < 5) {
          return oldBox
        }
        return newBox
      }}
    />
  )
}
