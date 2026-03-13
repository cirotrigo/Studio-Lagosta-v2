import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Lock, Unlock, MoveDown, MoveUp, Trash2 } from 'lucide-react'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { cn } from '@/lib/utils'
import type { Layer } from '@/types/template'

interface LayerItemProps {
  layer: Layer
  index: number
  totalLayers: number
  isSelected: boolean
  onSelect: (layerId: string, additive: boolean) => void
  onToggleVisibility: (layerId: string) => void
  onToggleLock: (layerId: string) => void
  onRemove: (layerId: string) => void
  onReorder: (layerId: string, direction: 'forward' | 'backward') => void
  onRename: (layerId: string, newName: string) => void
}

function LayerItem({
  layer,
  index,
  totalLayers,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRemove,
  onReorder,
  onRename,
}: LayerItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(layer.name ?? layer.type)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(layer.name ?? layer.type)
    setIsEditing(true)
  }

  const handleBlur = () => {
    if (editName.trim()) {
      onRename(layer.id, editName.trim())
    } else {
      setEditName(layer.name ?? layer.type)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    }
    if (e.key === 'Escape') {
      setEditName(layer.name ?? layer.type)
      setIsEditing(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-background/60 hover:border-primary/40',
        isDragging && 'shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button
            type="button"
            className="mt-0.5 cursor-grab rounded p-0.5 text-text-muted hover:bg-card hover:text-text active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>

          <div
            onClick={(e) => onSelect(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            onDoubleClick={handleDoubleClick}
            className="cursor-pointer"
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded border border-primary bg-background px-1 py-0.5 text-sm font-medium text-text outline-none"
              />
            ) : (
              <p className="text-sm font-medium text-text">{layer.name ?? layer.type}</p>
            )}
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-subtle">{layer.type}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisibility(layer.id)
            }}
            className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text"
          >
            {layer.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleLock(layer.id)
            }}
            className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text"
          >
            {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(layer.id)
            }}
            className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-error"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
        <span>
          X {Math.round(layer.x)} Y {Math.round(layer.y)}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation()
              onReorder(layer.id, 'forward')
            }}
            className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text disabled:opacity-30"
            title="Mover uma camada acima"
          >
            <MoveUp size={14} />
          </button>
          <button
            type="button"
            disabled={index === totalLayers - 1}
            onClick={(e) => {
              e.stopPropagation()
              onReorder(layer.id, 'backward')
            }}
            className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text disabled:opacity-30"
            title="Mover uma camada abaixo"
          >
            <MoveDown size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function LayersPanel() {
  const currentPage = useEditorStore(selectCurrentPageState)
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const reorderLayer = useEditorStore((state) => state.reorderLayer)
  const moveLayerToIndex = useEditorStore((state) => state.moveLayerToIndex)
  const toggleLayerVisibility = useEditorStore((state) => state.toggleLayerVisibility)
  const toggleLayerLock = useEditorStore((state) => state.toggleLayerLock)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (!currentPage) {
    return null
  }

  // Layers invertidas para exibição (topo = primeiro na lista visual)
  const layers = currentPage.layers.slice().reverse()
  const layerIds = layers.map((layer) => layer.id)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const newIndex = layers.findIndex((layer) => layer.id === over.id)

      // Converter de índice visual (invertido) para índice real
      const realNewIndex = layers.length - 1 - newIndex

      moveLayerToIndex(active.id as string, realNewIndex)
    }
  }

  const handleRename = (layerId: string, newName: string) => {
    updateLayer(layerId, (layer) => ({ ...layer, name: newName }))
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card/60">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Camadas</h2>
        <p className="mt-1 text-xs text-text-muted">Arraste para reordenar, duplo clique para renomear</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={layerIds} strategy={verticalListSortingStrategy}>
            {layers.map((layer, index) => (
              <LayerItem
                key={layer.id}
                layer={layer}
                index={index}
                totalLayers={layers.length}
                isSelected={selectedLayerIds.includes(layer.id)}
                onSelect={selectLayer}
                onToggleVisibility={toggleLayerVisibility}
                onToggleLock={toggleLayerLock}
                onRemove={removeLayer}
                onReorder={reorderLayer}
                onRename={handleRename}
              />
            ))}
          </SortableContext>
        </DndContext>

        {!layers.length ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            Nenhuma layer nesta página.
          </div>
        ) : null}
      </div>
    </div>
  )
}
