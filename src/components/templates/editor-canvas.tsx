"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import Konva from 'konva'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { TextToolbar } from './text-toolbar'
import { ImageToolbar } from './image-toolbar'
import { EffectsPanel } from '@/components/canvas/effects'
import { AlignmentToolbar } from './alignment-toolbar'
import { ZoomControls } from './zoom-controls'

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
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Debug: verificar dimensões do container
  React.useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      console.log('📐 [EditorCanvas] Dimensões do container:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom
      })
    }
  }, [])

  const {
    selectedLayerIds,
    design,
    updateLayer,
    duplicateLayer,
    removeLayer,
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
    alignSelectedToCanvasCenterH,
    alignSelectedToCanvasCenterV,
    zoom,
    setZoom,
  } = useTemplateEditor()
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
  const isImageSelected = selectedLayer?.type === 'image'

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

  // Atalhos de teclado globais
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver digitando em um input, textarea ou contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Cmd+J (Mac) ou Ctrl+J (Windows) - Duplicar layer
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        if (selectedLayerIds.length === 1) {
          duplicateLayer(selectedLayerIds[0])
          console.log('🔄 Layer duplicado via Cmd+J')
        }
      }

      // Delete ou Backspace - Deletar layer
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (selectedLayerIds.length > 0) {
          selectedLayerIds.forEach((id) => removeLayer(id))
          console.log('🗑️ Layer(s) deletado(s) via Delete/Backspace')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedLayerIds, duplicateLayer, removeLayer])

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

    // Salvar efeitos no estado do layer
    if (selectedLayer) {
      const effects = node.getAttr('effects')
      if (effects) {
        updateLayer(selectedLayer.id, (layer) => ({
          ...layer,
          effects: effects
        }))
      }
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      {/*
        Toolbar Container - Espaço reservado para evitar layout shift
        IMPORTANTE: Sempre manter altura fixa (min-h-[52px]) mesmo quando toolbar não está visível
        para prevenir que elementos do canvas "pulem" ao alternar entre seleções.
        52px = altura do toolbar (py-2 = 0.5rem * 2 = 16px + conteúdo ~36px)
      */}
      <div className="flex-shrink-0 min-h-[52px]">
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

        {/* Image Toolbar - mostrar apenas quando uma imagem estiver selecionada */}
        {isImageSelected && selectedLayer && (
          <ImageToolbar
            selectedLayer={selectedLayer}
            onUpdateLayer={(id, updates) => {
              updateLayer(id, (layer) => ({ ...layer, ...updates }))
            }}
          />
        )}
      </div>

      {/* Alignment Toolbar - sempre visível no topo do canvas */}
      <div className="flex items-center justify-center border-b border-border/40 bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <AlignmentToolbar
          selectedCount={selectedLayerIds.length}
          onAlignLeft={alignSelectedLeft}
          onAlignCenterH={alignSelectedCenterH}
          onAlignRight={alignSelectedRight}
          onAlignTop={alignSelectedTop}
          onAlignMiddleV={alignSelectedMiddleV}
          onAlignBottom={alignSelectedBottom}
          onDistributeH={distributeSelectedH}
          onDistributeV={distributeSelectedV}
          onBringToFront={bringSelectedToFront}
          onSendToBack={sendSelectedToBack}
          onMoveForward={moveSelectedForward}
          onMoveBackward={moveSelectedBackward}
          onAlignToCanvasCenterH={alignSelectedToCanvasCenterH}
          onAlignToCanvasCenterV={alignSelectedToCanvasCenterV}
        />
      </div>

      {/* Canvas Konva + Effects Panel */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Canvas Konva */}
        <div className="flex-1 h-full w-full">
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

        {/* Zoom Controls - centralizado acima da barra de páginas */}
        <ZoomControls
          zoom={zoom}
          onZoomChange={setZoom}
          minZoom={0.1}
          maxZoom={5}
          className="bottom-36"
        />
      </div>
    </div>
  )
}
