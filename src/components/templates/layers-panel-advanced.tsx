"use client"

import * as React from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { LayerItem } from './layers/layer-item'
import { LayerSearch } from './layers/layer-search'
import { LayersHelpModal } from './layers/layers-help-modal'
import { Layers, CheckSquare, SquareDashedMousePointer, HelpCircle } from 'lucide-react'

export function LayersPanelAdvanced() {
  const {
    design,
    selectedLayerIds,
    selectLayer,
    selectLayers,
    clearLayerSelection,
    toggleLayerVisibility,
    toggleLayerLock,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    updateLayer,
  } = useTemplateEditor()

  const [searchQuery, setSearchQuery] = React.useState('')
  const [showHelp, setShowHelp] = React.useState(false)

  // Ordenar camadas (camadas no topo têm order maior)
  const orderedLayers = React.useMemo(
    () => [...design.layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)),
    [design.layers]
  )

  // Filtrar camadas pela busca
  const filteredLayers = React.useMemo(() => {
    if (!searchQuery.trim()) return orderedLayers

    const query = searchQuery.toLowerCase()
    return orderedLayers.filter(
      (layer) =>
        layer.name.toLowerCase().includes(query) ||
        layer.type.toLowerCase().includes(query)
    )
  }, [orderedLayers, searchQuery])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = orderedLayers.findIndex((layer) => layer.id === active.id)
    const newIndex = orderedLayers.findIndex((layer) => layer.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(orderedLayers, oldIndex, newIndex)

    // Reverter a ordem porque orderedLayers está invertido (top first)
    const reorderedIds = [...newOrder].reverse().map((layer) => layer.id)
    reorderLayers(reorderedIds)
  }

  const handleSelectAll = () => {
    const allIds = filteredLayers.map((layer) => layer.id)
    selectLayers(allIds)
  }

  const handleInvertSelection = () => {
    const selectedSet = new Set(selectedLayerIds)
    const invertedIds = filteredLayers
      .filter((layer) => !selectedSet.has(layer.id))
      .map((layer) => layer.id)
    selectLayers(invertedIds)
  }

  const handleBringToFront = (layerId: string) => {
    const maxOrder = Math.max(...design.layers.map((l) => l.order ?? 0))
    updateLayer(layerId, (layer) => ({ ...layer, order: maxOrder + 1 }))
  }

  const handleSendToBack = (layerId: string) => {
    const minOrder = Math.min(...design.layers.map((l) => l.order ?? 0))
    updateLayer(layerId, (layer) => ({ ...layer, order: minOrder - 1 }))
  }

  const handleDeleteLayer = (layerId: string) => {
    if (confirm('Deletar esta camada?')) {
      removeLayer(layerId)
    }
  }

  const handleRename = (layerId: string, name: string) => {
    updateLayer(layerId, (layer) => ({ ...layer, name }))
  }

  // Atalhos de teclado
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const isModifier = event.metaKey || event.ctrlKey

      // Delete/Backspace - deletar selecionados
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLayerIds.length > 0) {
        event.preventDefault()
        if (confirm(`Deletar ${selectedLayerIds.length} camada(s)?`)) {
          selectedLayerIds.forEach((id) => removeLayer(id))
        }
        return
      }

      // Ctrl+A - selecionar todos
      if (isModifier && event.key === 'a') {
        event.preventDefault()
        handleSelectAll()
        return
      }

      // Ctrl+D - duplicar selecionados
      if (isModifier && event.key === 'd') {
        event.preventDefault()
        selectedLayerIds.forEach((id) => duplicateLayer(id))
        return
      }

      // Escape - limpar seleção
      if (event.key === 'Escape') {
        clearLayerSelection()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedLayerIds, clearLayerSelection, duplicateLayer, removeLayer])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Camadas</h3>
            <p className="text-[11px] text-muted-foreground">
              {filteredLayers.length} {filteredLayers.length === 1 ? 'camada' : 'camadas'}
            </p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setShowHelp(true)}
          title="Ajuda e atalhos"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="border-b border-border/40 px-4 py-2">
        <LayerSearch value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Layers List */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredLayers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
              {filteredLayers.map((layer) => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerIds.includes(layer.id)}
                  onSelect={(event) => {
                    const additive = event.shiftKey || event.metaKey || event.ctrlKey
                    selectLayer(layer.id, { additive, toggle: additive })
                  }}
                  onToggleVisibility={() => toggleLayerVisibility(layer.id)}
                  onToggleLock={() => toggleLayerLock(layer.id)}
                  onDelete={() => handleDeleteLayer(layer.id)}
                  onDuplicate={() => duplicateLayer(layer.id)}
                  onRename={(name) => handleRename(layer.id, name)}
                  onBringToFront={() => handleBringToFront(layer.id)}
                  onSendToBack={() => handleSendToBack(layer.id)}
                />
              ))}
              {filteredLayers.length === 0 && !searchQuery && (
                  <div className="rounded-md border border-dashed border-border/50 p-6 text-center">
                    <Layers className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      Nenhuma camada criada ainda
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Use a barra superior para adicionar elementos
                    </p>
                  </div>
                )}
                {filteredLayers.length === 0 && searchQuery && (
                  <div className="rounded-md border border-dashed border-border/50 p-6 text-center">
                    <p className="text-xs text-muted-foreground">
                      Nenhuma camada encontrada para "{searchQuery}"
                    </p>
                  </div>
                )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </ScrollArea>
      </div>

      {/* Footer Actions */}
      <div className="flex gap-2 border-t border-border/40 px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={handleSelectAll}
          disabled={filteredLayers.length === 0}
        >
          <CheckSquare className="mr-2 h-3.5 w-3.5" />
          Todos
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={handleInvertSelection}
          disabled={filteredLayers.length === 0}
        >
          <SquareDashedMousePointer className="mr-2 h-3.5 w-3.5" />
          Inverter
        </Button>
      </div>

      {/* Help Modal */}
      <LayersHelpModal open={showHelp} onOpenChange={setShowHelp} />
    </div>
  )
}
