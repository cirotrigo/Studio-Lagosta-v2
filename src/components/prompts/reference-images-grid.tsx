'use client'

import { X, ImageOff } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import * as React from 'react'

interface ReferenceImagesGridProps {
  images: string[]
  editable?: boolean
  onRemove?: (index: number) => void
  className?: string
  maxDisplay?: number
}

export function ReferenceImagesGrid({
  images,
  editable = false,
  onRemove,
  className,
  maxDisplay,
}: ReferenceImagesGridProps) {
  const [failedImages, setFailedImages] = React.useState<Set<number>>(new Set())

  // Debug: log das imagens recebidas
  React.useEffect(() => {
    console.log('[ReferenceImagesGrid] Renderizando imagens:', {
      total: images.length,
      images,
      maxDisplay,
      displayCount: maxDisplay ? Math.min(images.length, maxDisplay) : images.length
    })
  }, [images, maxDisplay])

  if (images.length === 0) {
    return null
  }

  const displayImages = maxDisplay ? images.slice(0, maxDisplay) : images
  const remainingCount = images.length - displayImages.length

  const handleImageError = (index: number) => {
    console.error('[ReferenceImagesGrid] Falha ao carregar imagem:', {
      index,
      url: displayImages[index]
    })
    setFailedImages(prev => new Set(prev).add(index))
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {displayImages.map((imageUrl, index) => (
        <div
          key={index}
          className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted"
        >
          {failedImages.has(index) ? (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground/40" />
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={`Reference ${index + 1}`}
              fill
              className="object-cover"
              sizes="80px"
              unoptimized
              onError={() => handleImageError(index)}
            />
          )}

          {editable && onRemove && (
            <button
              onClick={() => onRemove(index)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive/90 group-hover:opacity-100"
              title="Remover imagem"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {remainingCount > 0 && (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-muted text-sm font-medium text-muted-foreground">
          +{remainingCount}
        </div>
      )}
    </div>
  )
}
