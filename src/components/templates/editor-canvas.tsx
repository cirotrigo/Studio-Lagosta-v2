"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import Konva from 'konva'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { TextToolbar } from './text-toolbar'
import { EffectsPanel } from '@/components/canvas/effects'

const KonvaEditorStage = dynamic(
  () => import('./konva-editor-stage').then((mod) => mod.KonvaEditorStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full flex-1 items-center justify-center overflow-auto rounded-lg border border-border/40 bg-muted/50 p-8">
        <Skeleton className="h-[480px] w-full" />
      </div>
    ),
  },
)

export function EditorCanvas() {
  const { selectedLayerIds, design, updateLayer } = useTemplateEditor()
  const [isEffectsPanelOpen, setIsEffectsPanelOpen] = React.useState(false)
  const [selectedTextNode, setSelectedTextNode] = React.useState<Konva.Text | Konva.TextPath | null>(null)
  const [currentLayer, setCurrentLayer] = React.useState<Konva.Layer | null>(null)

  // Obter layer selecionado para verificar se é texto
  const selectedLayer = React.useMemo(() => {
    if (selectedLayerIds.length === 1) {
      return design.layers.find((layer) => layer.id === selectedLayerIds[0])
    }
    return null
  }, [selectedLayerIds, design.layers])

  const isTextSelected = selectedLayer?.type === 'text'

  // Atualizar node selecionado quando layer muda
  React.useEffect(() => {
    // Usar setTimeout para garantir que o DOM do Konva já foi renderizado
    const timeoutId = setTimeout(() => {
      if (!selectedLayer || !isTextSelected) {
        setSelectedTextNode(null)
        setCurrentLayer(null)
        return
      }

      // Buscar stage no DOM
      const stageElement = document.querySelector('.konvajs-content')
      if (!stageElement) {
        console.warn('[EditorCanvas] Stage element não encontrado')
        return
      }

      // Pegar stage do Konva
      const stage = Konva.stages.find(s => s.container() === stageElement.parentElement)
      if (!stage) {
        console.warn('[EditorCanvas] Konva stage não encontrado')
        return
      }

      console.log('[EditorCanvas] Stage encontrado:', stage)

      // Encontrar layer - procurar em todos os children do stage
      const children = stage.children || []
      console.log('[EditorCanvas] Stage children:', children.length)

      // Procurar o node em todos os layers
      let foundNode: Konva.Text | Konva.TextPath | null = null
      let foundLayer: Konva.Layer | null = null

      for (const child of children) {
        if (child instanceof Konva.Layer) {
          const nodes = child.find(`#${selectedLayer.id}`)
          console.log('[EditorCanvas] Buscando em layer, ID:', selectedLayer.id, 'Encontrou:', nodes.length)

          if (nodes.length > 0) {
            foundNode = nodes[0] as Konva.Text | Konva.TextPath
            foundLayer = child
            console.log('[EditorCanvas] Node encontrado:', foundNode.getClassName())
            break
          }
        }
      }

      if (foundNode && foundLayer) {
        setSelectedTextNode(foundNode)
        setCurrentLayer(foundLayer)
      } else {
        console.warn('[EditorCanvas] Nenhum node encontrado com ID:', selectedLayer.id)
        setSelectedTextNode(null)
        setCurrentLayer(null)
      }
    }, 100) // Pequeno delay para garantir que Konva renderizou

    return () => clearTimeout(timeoutId)
  }, [selectedLayer, isTextSelected])

  // Fechar painel quando layer deselecionar
  React.useEffect(() => {
    if (!isTextSelected) {
      setIsEffectsPanelOpen(false)
    }
  }, [isTextSelected])

  const handleEffectsClick = () => {
    console.log('[EditorCanvas] Effects button clicked. Current state:', isEffectsPanelOpen)
    console.log('[EditorCanvas] Selected node:', selectedTextNode?.getClassName())
    console.log('[EditorCanvas] Layer:', currentLayer?.getClassName())
    setIsEffectsPanelOpen(!isEffectsPanelOpen)
  }

  const handleEffectChange = (node: Konva.Text | Konva.TextPath) => {
    // Atualizar referência do node
    setSelectedTextNode(node)

    // Force layer redraw
    if (currentLayer) {
      currentLayer.batchDraw()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Text Toolbar - mostrar apenas quando um texto estiver selecionado */}
      {isTextSelected && selectedLayer && (
        <TextToolbar
          selectedLayer={selectedLayer}
          onUpdateLayer={(id, updates) => {
            updateLayer(id, (layer) => ({ ...layer, ...updates }))
          }}
          onEffectsClick={handleEffectsClick}
        />
      )}

      {/* Canvas Konva + Effects Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Konva */}
        <div className="flex-1 overflow-hidden">
          <KonvaEditorStage />
        </div>

        {/* Effects Panel - lateral direito */}
        {isEffectsPanelOpen && isTextSelected && (
          <EffectsPanel
            selectedNode={selectedTextNode}
            layer={currentLayer}
            onClose={() => setIsEffectsPanelOpen(false)}
            onEffectChange={handleEffectChange}
          />
        )}
      </div>
    </div>
  )
}
