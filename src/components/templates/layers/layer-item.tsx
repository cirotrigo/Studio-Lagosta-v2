"use client"

import * as React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  GripVertical,
  Trash2,
  Copy,
  MoveUp,
  MoveDown,
  Sparkles,
} from 'lucide-react'
import type { Layer } from '@/types/template'
import { getLayerIcon } from './layer-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LayerItemProps {
  layer: Layer
  isSelected: boolean
  onSelect: (event: React.MouseEvent) => void
  onToggleVisibility: () => void
  onToggleLock: () => void
  onToggleDynamic?: () => void
  onDelete: () => void
  onDuplicate: () => void
  onRename: (name: string) => void
  onBringToFront: () => void
  onSendToBack: () => void
}

export function LayerItem({
  layer,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onToggleDynamic,
  onDelete,
  onDuplicate,
  onRename,
  onBringToFront,
  onSendToBack,
}: LayerItemProps) {
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [editName, setEditName] = React.useState(layer.name)
  const inputRef = React.useRef<HTMLInputElement>(null)

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
  }

  const handleDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    setIsRenaming(true)
    setEditName(layer.name)
  }

  const handleRenameSubmit = () => {
    if (editName.trim() && editName !== layer.name) {
      onRename(editName.trim())
    } else {
      setEditName(layer.name)
    }
    setIsRenaming(false)
  }

  const handleRenameKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleRenameSubmit()
    } else if (event.key === 'Escape') {
      setEditName(layer.name)
      setIsRenaming(false)
    }
  }

  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const LayerIcon = getLayerIcon(layer.type)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-all',
        isSelected
          ? 'border-primary bg-primary/10 shadow-sm'
          : 'border-transparent bg-muted/40 hover:bg-muted/70',
        isDragging && 'opacity-50 shadow-lg',
        layer.visible === false && 'opacity-60',
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        title="Arrastar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Layer Icon */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-primary/20 to-primary/5">
        <LayerIcon className="h-3.5 w-3.5 text-primary" />
      </div>

      {/* Layer Info */}
      <div className="min-w-0 flex-1 overflow-hidden" onClick={onSelect} onDoubleClick={handleDoubleClick}>
        {isRenaming ? (
          <Input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            className="h-6 px-2 text-xs"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-pointer overflow-hidden">
                  <div
                    className="truncate text-xs font-medium"
                    style={{ maxWidth: '140px' }}
                  >
                    {layer.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="capitalize">{layer.type}</span>
                    {layer.type === 'image' && layer.isDynamic && (
                      <Badge variant="secondary" className="h-3.5 px-1 text-[9px] font-medium">
                        <Sparkles className="mr-0.5 h-2 w-2" />
                        Dinâmica
                      </Badge>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-xs font-medium">{layer.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {layer.type} • {layer.position && `${Math.round(layer.position.x)} × ${Math.round(layer.position.y)}`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Actions (visible on hover or selected) */}
      <div className={cn(
        'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity',
        (isSelected || isDragging) && 'opacity-100',
        'group-hover:opacity-100'
      )}>
        {/* Toggle Imagem Dinâmica - Apenas para imagens */}
        {layer.type === 'image' && onToggleDynamic && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'h-6 w-6',
                    layer.isDynamic && 'bg-primary/20 text-primary hover:bg-primary/30'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleDynamic()
                  }}
                  title={layer.isDynamic ? 'Imagem dinâmica ativa' : 'Marcar como dinâmica'}
                >
                  <Sparkles className={cn('h-3.5 w-3.5', layer.isDynamic && 'fill-current')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">
                  {layer.isDynamic ? 'Imagem dinâmica ativa' : 'Marcar como dinâmica'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Permite substituição no gerador de criativos
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Visibility Toggle */}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisibility()
          }}
          title={layer.visible === false ? 'Mostrar' : 'Ocultar'}
        >
          {layer.visible === false ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Lock Toggle */}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation()
            onToggleLock()
          }}
          title={layer.locked ? 'Desbloquear' : 'Bloquear'}
        >
          {layer.locked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Unlock className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Context Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-6 w-6">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="8" cy="3" r="1.5" fill="currentColor" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                <circle cx="8" cy="13" r="1.5" fill="currentColor" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBringToFront}>
              <MoveUp className="mr-2 h-4 w-4" />
              Trazer para Frente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSendToBack}>
              <MoveDown className="mr-2 h-4 w-4" />
              Enviar para Trás
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setIsRenaming(true)
                setEditName(layer.name)
              }}
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Renomear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Deletar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
