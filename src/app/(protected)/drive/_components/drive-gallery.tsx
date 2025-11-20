'use client'

import * as React from 'react'
import { HardDrive, Loader2 } from 'lucide-react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { GoogleDriveItem } from '@/types/google-drive'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DriveItem } from './drive-item'

interface DriveGalleryProps {
  items: GoogleDriveItem[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  onLoadMore: () => void
  onOpenItem: (item: GoogleDriveItem) => void
  onDownloadItem: (item: GoogleDriveItem) => void
  onMoveItem: (item: GoogleDriveItem) => void
  onMoveToFolder: (fileIds: string[], folderId: string) => void
  onDeleteItem?: (item: GoogleDriveItem) => void
  selectedFileIds: string[]
  onToggleSelect: (id: string) => void
}

export function DriveGallery({
  items,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onOpenItem,
  onDownloadItem,
  onMoveItem,
  onMoveToFolder,
  onDeleteItem,
  selectedFileIds,
  onToggleSelect,
}: DriveGalleryProps) {
  const isEmpty = !items.length && !isLoading
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const targetItem = event.over?.data.current?.item as GoogleDriveItem | undefined
    if (!targetItem || targetItem.kind !== 'folder') return
    if (targetItem.id === event.active.id) return
    const fileIds =
      selectedFileIds.includes(String(event.active.id)) && selectedFileIds.length
        ? selectedFileIds
        : [String(event.active.id)]
    onMoveToFolder(fileIds, targetItem.id)
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/60 py-20 text-center text-sm text-muted-foreground">
        <HardDrive className="mb-4 h-10 w-10 text-muted-foreground/60" />
        <p>Nenhum arquivo encontrado nesta pasta.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <DriveItem
              key={item.id}
              item={item}
              selected={selectedFileIds.includes(item.id)}
              onToggleSelect={() => onToggleSelect(item.id)}
              onOpen={onOpenItem}
              onDownload={onDownloadItem}
              onMove={onMoveItem}
              onDelete={onDeleteItem}
            />
          ))}
          {isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`drive-skeleton-${index}`} className="h-[220px] rounded-2xl" />
            ))}
        </div>
      </DndContext>
      {hasNextPage && (
        <Button onClick={onLoadMore} variant="outline" className="mx-auto" disabled={isFetchingNextPage}>
          {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Carregar mais
        </Button>
      )}
    </div>
  )
}
