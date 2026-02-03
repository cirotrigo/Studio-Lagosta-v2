'use client'

import * as React from 'react'
import { HardDrive, Loader2 } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { GoogleDriveItem } from '@/types/google-drive'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePhotoSwipe } from '@/hooks/use-photoswipe'
import { DriveItem } from './drive-item'
import { PendingGenerationCard } from './pending-generation-card'
import type { TemplateListItem } from '@/hooks/use-templates'
import type { PendingGeneration } from './ai-edit-modal'

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
  templates: TemplateListItem[]
  onOpenInTemplate: (item: GoogleDriveItem, templateId: number) => void
  onEditWithAI?: (item: GoogleDriveItem) => void
  pendingGenerations?: PendingGeneration[]
  onRemovePendingGeneration?: (id: string) => void
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
  templates,
  onOpenInTemplate,
  onEditWithAI,
  pendingGenerations = [],
  onRemovePendingGeneration,
}: DriveGalleryProps) {
  const isEmpty = !items.length && !isLoading
  const galleryId = React.useId()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const shouldEnablePhotoSwipe = items.some((item) => item.kind === 'file')
  usePhotoSwipe({
    gallerySelector: `#${galleryId}`,
    childSelector: 'a[data-pswp-src]',
    dependencies: [items.length, galleryId],
    enabled: shouldEnablePhotoSwipe,
  })

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

  const hasPendingGenerations = pendingGenerations.length > 0

  if (isEmpty && !hasPendingGenerations) {
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
        <div id={galleryId} className="w-full columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
          {/* Pending AI Generations */}
          <AnimatePresence mode="popLayout">
            {pendingGenerations.map((generation) => (
              <div key={generation.id} className="break-inside-avoid mb-4">
                <PendingGenerationCard
                  generation={generation}
                  onRemove={onRemovePendingGeneration}
                />
              </div>
            ))}
          </AnimatePresence>

          {/* Drive Items */}
          {items.map((item) => (
            <div key={item.id} className="break-inside-avoid mb-4">
              <DriveItem
                item={item}
                selected={selectedFileIds.includes(item.id)}
                onToggleSelect={() => onToggleSelect(item.id)}
                onOpen={onOpenItem}
                onDownload={onDownloadItem}
                onMove={onMoveItem}
                onDelete={onDeleteItem}
                templates={templates}
                onOpenInTemplate={onOpenInTemplate}
                onEditWithAI={onEditWithAI}
              />
            </div>
          ))}
          {isLoading &&
            Array.from({ length: 8 }).map((_, index) => (
              <div key={`drive-skeleton-${index}`} className="break-inside-avoid mb-4">
                <Skeleton className="w-full aspect-[4/5] rounded-xl" />
              </div>
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
