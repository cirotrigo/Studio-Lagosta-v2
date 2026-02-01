'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Eye, EyeOff, Trash2, GripVertical, ArrowUp, ArrowDown, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Layer } from '@/types/template'

interface LayerControlsProps {
  layers: Layer[]
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onReorder: (newOrder: string[]) => void
  hiddenLayerIds: Set<string>
  onToggleVisibility: (layerId: string) => void
  onDeleteLayer: (layerId: string) => void
}

export function LayerControls({
  layers,
  selectedLayerId,
  onSelectLayer,
  onReorder,
  hiddenLayerIds,
  onToggleVisibility,
  onDeleteLayer,
}: LayerControlsProps) {
  const [layerToDelete, setLayerToDelete] = useState<string | null>(null)

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const newOrder = [...layers.map((l) => l.id)]
    ;[newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]]
    onReorder(newOrder)
  }

  const handleMoveDown = (index: number) => {
    if (index >= layers.length - 1) return
    const newOrder = [...layers.map((l) => l.id)]
    ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    onReorder(newOrder)
  }

  const handleDelete = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId)
    const isBackgroundRemoved = layer?.metadata?.isBackgroundRemoved

    if (isBackgroundRemoved) {
      onDeleteLayer(layerId)
    } else {
      setLayerToDelete(layerId)
    }
  }

  const confirmDelete = () => {
    if (layerToDelete) {
      onDeleteLayer(layerToDelete)
      setLayerToDelete(null)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4" />
        <h3 className="text-sm font-medium">Camadas</h3>
      </div>

      <div className="space-y-1">
        {layers.map((layer, index) => {
          const isHidden = hiddenLayerIds.has(layer.id)
          const isSelected = layer.id === selectedLayerId
          const isBackgroundRemoved = layer.metadata?.isBackgroundRemoved

          return (
            <div
              key={layer.id}
              className={cn(
                'p-2 rounded-md cursor-pointer transition-colors',
                isSelected ? 'bg-accent' : 'hover:bg-muted',
                isHidden && 'opacity-50'
              )}
              onClick={() => onSelectLayer(layer.id)}
            >
              {/* Layer name on top */}
              <p className={cn('text-xs mb-1 truncate', isHidden && 'text-muted-foreground')}>
                {layer.name}
                {isBackgroundRemoved && (
                  <span className="ml-1 text-muted-foreground">(sem fundo)</span>
                )}
              </p>

              {/* Action buttons below */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility(layer.id)
                  }}
                >
                  {!isHidden ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMoveUp(index)
                  }}
                  disabled={index === 0}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMoveDown(index)
                  }}
                  disabled={index === layers.length - 1}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(layer.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {layers.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma camada</p>
      )}

      <AlertDialog open={!!layerToDelete} onOpenChange={() => setLayerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir camada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. A camada sera removida permanentemente do criativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
