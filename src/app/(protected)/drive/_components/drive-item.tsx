'use client'

import * as React from 'react'
import Image from 'next/image'
import { FileImage, Folder, MoreHorizontal, Eye, Download as DownloadIcon, MoveRight, CheckSquare, Trash2 } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { GoogleDriveItem } from '@/types/google-drive'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface DriveItemProps {
  item: GoogleDriveItem
  selected: boolean
  onToggleSelect: () => void
  onOpen: (item: GoogleDriveItem) => void
  onDownload: (item: GoogleDriveItem) => void
  onMove: (item: GoogleDriveItem) => void
  onDelete?: (item: GoogleDriveItem) => void
}

const MIME_FOLDER = 'application/vnd.google-apps.folder'

function formatBytes(size?: number) {
  if (!size) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatDate(date?: string) {
  if (!date) return '—'
  const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
  return formatter.format(new Date(date))
}

export function DriveItem({ item, selected, onToggleSelect, onOpen, onDownload, onMove, onDelete }: DriveItemProps) {
  const isFolder = item.kind === 'folder' || item.mimeType === MIME_FOLDER
  const resolvedFileId = item.shortcutDetails?.targetId ?? item.id
  const thumbnailUrl = isFolder ? undefined : `/api/drive/thumbnail/${resolvedFileId}`

  const handleDoubleClick = React.useCallback(() => {
    onOpen(item)
  }, [item, onOpen])

  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
  })

  const { isOver, setNodeRef: setDropNodeRef } = useDroppable({
    id: `folder-${item.id}`,
    disabled: !isFolder,
    data: { item },
  })

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDragNodeRef(node)
      if (isFolder) {
        setDropNodeRef(node)
      }
    },
    [isFolder, setDragNodeRef, setDropNodeRef],
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : undefined,
  }

  return (
    <div
      ref={setRefs}
      style={style}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg',
        selected && 'border-primary/70 shadow-lg',
        isOver && isFolder && 'border-primary/80 ring-2 ring-primary/40',
      )}
      onDoubleClick={handleDoubleClick}
      {...attributes}
      {...listeners}
    >
      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-xl bg-muted/40">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={item.name}
            fill
            sizes="200px"
            className="object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Folder className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-2 top-2 z-10">
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelect()} aria-label="Selecionar arquivo" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="absolute right-2 top-2 z-10 rounded-full bg-background/80 backdrop-blur">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onOpen(item)}>
              <Eye className="h-4 w-4" /> Abrir
            </DropdownMenuItem>
            {!isFolder && (
              <DropdownMenuItem onSelect={() => onDownload(item)}>
                <DownloadIcon className="h-4 w-4" /> Download
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onMove(item)}>
              <MoveRight className="h-4 w-4" /> Mover
            </DropdownMenuItem>
            {onDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(item)}>
                <Trash2 className="h-4 w-4" />
                Apagar
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onToggleSelect}>
              <CheckSquare className="h-4 w-4" /> {selected ? 'Remover seleção' : 'Selecionar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-semibold leading-tight">
          {isFolder ? <Folder className="h-4 w-4 text-muted-foreground" /> : <FileImage className="h-4 w-4 text-muted-foreground" />}
          <span className="line-clamp-1" title={item.name}>
            {item.name}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {isFolder ? 'Pasta do Drive' : `${item.mimeType.split('/')[1]?.toUpperCase() || item.mimeType}`}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatBytes(item.size)}</span>
          <span>{formatDate(item.modifiedTime)}</span>
        </div>
      </div>
    </div>
  )
}
