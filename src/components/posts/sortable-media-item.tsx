'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface MediaItem {
  id: string
  type: 'generation' | 'google-drive' | 'upload'
  url: string
  pathname?: string
  thumbnailUrl?: string
  name: string
  size?: number
  mimeType?: string
}

interface SortableMediaItemProps {
  item: MediaItem
  index: number
  onRemove: (index: number) => void
  isDragging?: boolean
}

// Helper to detect if media is a video
function isVideoFile(item: MediaItem): boolean {
  // Check mimeType first (most reliable)
  if (item.mimeType?.startsWith('video/')) return true

  // Check file URL extension
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.m4v']
  const url = item.url?.toLowerCase() || ''
  if (videoExtensions.some(ext => url.includes(ext))) return true

  // Fallback to file name extension check
  const fileName = item.name?.toLowerCase() || ''
  return videoExtensions.some(ext => fileName.endsWith(ext))
}

export function SortableMediaItem({
  item,
  index,
  onRemove,
}: SortableMediaItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  }

  const isVideo = isVideoFile(item)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        isDragging && 'opacity-50'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'aspect-square rounded-lg overflow-hidden border-2 bg-muted transition-all',
          'cursor-grab active:cursor-grabbing touch-none',
          isDragging ? 'border-primary shadow-lg scale-105' : 'border-primary hover:border-primary/80'
        )}
      >
        {isVideo ? (
          <>
            {item.thumbnailUrl ? (
              // Use thumbnail image if available (better performance)
              <Image
                src={item.thumbnailUrl}
                alt={item.name}
                fill
                sizes="120px"
                className="object-cover pointer-events-none"
                unoptimized
              />
            ) : (
              // Fallback to video element
              <video
                src={`${item.url}#t=0.1`}
                className="w-full h-full object-cover pointer-events-none"
                muted
                playsInline
                preload="metadata"
              />
            )}
            {/* Play icon overlay para vídeos */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="bg-white/90 rounded-full p-1">
                <Play className="w-3 h-3 text-black" fill="black" />
              </div>
            </div>
          </>
        ) : (
          <Image
            src={item.thumbnailUrl || item.url}
            alt={item.name}
            fill
            sizes="120px"
            className="object-cover pointer-events-none"
            unoptimized
          />
        )}

        {/* Drag indicator - Top left */}
        <div className={cn(
          'absolute top-1 left-1 p-1 rounded-md',
          'bg-black/60 text-white',
          'transition-all duration-200'
        )}>
          <GripVertical className="w-3 h-3" />
        </div>

        {/* Remove button - Needs to stop propagation */}
        <div
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="icon"
            variant="destructive"
            className="h-6 w-6"
            onClick={() => onRemove(index)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* Order badge - Bottom left */}
        <div className="absolute bottom-1 left-1 pointer-events-none">
          <Badge variant="secondary" className="text-xs px-2 py-0.5 font-bold bg-primary text-primary-foreground">
            {index + 1}
          </Badge>
        </div>

        {/* Type badge - Bottom right */}
        <div className="absolute bottom-1 right-1 pointer-events-none">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {item.type === 'generation' ? 'Criativo' :
             item.type === 'google-drive' ? 'Drive' : 'Upload'}
          </Badge>
        </div>
      </div>

      <p className="text-[10px] text-center mt-1 text-muted-foreground truncate pointer-events-none" title={item.name}>
        {item.name}
      </p>
    </div>
  )
}
