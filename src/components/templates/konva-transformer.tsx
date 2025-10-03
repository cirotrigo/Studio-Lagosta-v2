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

  return (
    <Transformer
      ref={transformerRef}
      rotateEnabled
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
