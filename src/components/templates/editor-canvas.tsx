"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import Konva from 'konva'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'
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

/** Deslocamento unitário de cada seta, em pixels do canvas */
const NUDGE_DELTAS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

export function EditorCanvas() {
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Debug: verificar dimensões do container (desabilitado para reduzir logs)
  // React.useEffect(() => {
  //   if (containerRef.current) {
  //     const rect = containerRef.current.getBoundingClientRect()
  //     console.log('📐 [EditorCanvas] Dimensões do container:', {
  //       width: rect.width,
  //       height: rect.height,
  //       top: rect.top,
  //       bottom: rect.bottom
  //     })
  //   }
  // }, [])

  const {
    selectedLayerIds,
    design,
    updateLayer,
    duplicateLayer,
    removeLayer,
    moveLayer,
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
    croppingLayerId,
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
  const isRichTextSelected = selectedLayer?.type === 'rich-text'
  const isAnyTextSelected = isTextSelected || isRichTextSelected
  const isImageSelected = selectedLayer?.type === 'image'
  const isLogoSelected = selectedLayer?.type === 'logo'
  // Mostrar toolbar de imagem para imagem OU logo
  const showImageToolbar = isImageSelected || isLogoSelected


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

      // Encontrar layer - procurar em todos os children do stage
      const children = stage.children || []

      // Procurar o node em todos os layers
      let foundNode: Konva.Text | Konva.TextPath | null = null
      let foundLayer: Konva.Layer | null = null

      for (const child of children) {
        if (child instanceof Konva.Layer) {
          const nodes = child.find(`#${selectedLayer.id}`)

          if (nodes.length > 0) {
            foundNode = nodes[0] as Konva.Text | Konva.TextPath
            foundLayer = child
            break
          }
        }
      }

      if (foundNode && foundLayer) {
        setSelectedTextNode(foundNode)
        setCurrentLayer(foundLayer)
      } else {
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

      // Modo de recorte: Enter/Esc são do overlay; nada de deletar/mover aqui
      if (croppingLayerId) return

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

      // Setas - Posicionar a seleção 1px por vez (10px com Shift).
      // Sem seleção, a seta segue rolando a página como de costume.
      const nudge = NUDGE_DELTAS[e.key]
      if (nudge && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const alvos = selectedLayerIds.filter(
          (id) => !design.layers.find((layer) => layer.id === id)?.locked,
        )
        if (alvos.length === 0) return

        e.preventDefault()
        const passo = e.shiftKey ? 10 : 1
        alvos.forEach((id) => moveLayer(id, nudge.x * passo, nudge.y * passo))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedLayerIds, design.layers, duplicateLayer, removeLayer, moveLayer, croppingLayerId])

  const handleEffectsClick = () => {
    console.log('[EditorCanvas] Effects button clicked. Current state:', isEffectsPanelOpen)
    console.log('[EditorCanvas] Selected node:', selectedTextNode?.getClassName())
    console.log('[EditorCanvas] Layer:', currentLayer?.getClassName())
    setIsEffectsPanelOpen(!isEffectsPanelOpen)
  }

  const handleEffectChange = (node: Konva.Text | Konva.TextPath) => {
    console.log('[EditorCanvas] handleEffectChange called')

    // Atualizar referência do node
    setSelectedTextNode(node)

    // Force layer redraw
    if (currentLayer) {
      currentLayer.batchDraw()
    }

    // Salvar efeitos no estado do layer
    if (selectedLayer) {
      const effects = node.getAttr('effects')
      console.log('[EditorCanvas] Effects from node:', effects)
      console.log('[EditorCanvas] Selected layer ID:', selectedLayer.id)

      if (effects) {
        console.log('[EditorCanvas] Updating layer with effects:', effects)
        updateLayer(selectedLayer.id, (layer) => ({
          ...layer,
          effects: effects
        }))
      } else {
        console.warn('[EditorCanvas] No effects found on node')
      }
    } else {
      console.warn('[EditorCanvas] No selected layer')
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      {/* Zona de toolbars com altura FIXA — o canvas nunca se move ao selecionar uma camada */}
      <div
        className="flex-shrink-0 z-30 flex flex-col items-center justify-start gap-1 overflow-hidden px-2 pt-2"
        style={{ height: 118 }}
      >
          {/* Modo de recorte: as toolbars saem e entram Aplicar/Cancelar */}
          {croppingLayerId ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/40 bg-background/95 p-2 shadow-md backdrop-blur">
              <span className="px-1 text-xs text-muted-foreground">Ajuste a área de recorte</span>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => window.dispatchEvent(new Event('lagosta:crop-confirm'))}
              >
                <Check className="h-4 w-4" />
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => window.dispatchEvent(new Event('lagosta:crop-cancel'))}
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>
          ) : (
          <>
          {/* Alignment Toolbar - no mobile só aparece com camada selecionada; desktop sempre */}
          <div className={`pointer-events-auto max-w-full overflow-x-auto rounded-lg border border-border/40 bg-background/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80 ${selectedLayerIds.length > 0 ? '' : 'hidden md:block'}`}>
            <div className="flex items-center justify-center p-1.5 min-w-max">
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
            selectedLayerType={selectedLayer?.type}
            onConvertToRichText={
              selectedLayer?.type === 'text'
                ? () => {
                    updateLayer(selectedLayer.id, (layer) => ({
                      ...layer,
                      type: 'rich-text' as const,
                      richTextStyles: [],
                    }))
                  }
                : undefined
            }
          />
            </div>
          </div>

          {/* Toolbar contextual de texto */}
          {isTextSelected && selectedLayer && (
            <div className="pointer-events-auto max-w-full">
              <TextToolbar
                selectedLayer={selectedLayer}
                onUpdateLayer={(id, updates) => {
                  updateLayer(id, (layer) => ({ ...layer, ...updates }))
                }}
              />
            </div>
          )}

          {/* Toolbar contextual de imagem/logo */}
          {showImageToolbar && selectedLayer && (
            <div className="pointer-events-auto max-w-full">
              <ImageToolbar
                selectedLayer={selectedLayer}
                onUpdateLayer={(id, updates) => {
                  updateLayer(id, (layer) => ({ ...layer, ...updates }))
                }}
              />
            </div>
          )}
          </>
          )}
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

        {/* Zoom Controls - centralizado horizontalmente no rodapé (APENAS DESKTOP) */}
        <div className="hidden md:block">
          <ZoomControls
            zoom={zoom}
            onZoomChange={setZoom}
            minZoom={0.1}
            maxZoom={5}
          />
        </div>
      </div>
    </div>
  )
}
