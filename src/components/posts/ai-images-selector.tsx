'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, Check, Eye, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { usePhotoSwipe } from '@/hooks/use-photoswipe'

interface AIGeneratedImage {
  id: string
  name: string
  prompt: string
  fileUrl: string
  thumbnailUrl?: string | null
  width: number
  height: number
  aspectRatio: string
  provider: string
  model: string
  createdAt: string
}

interface AIImagesSelectorProps {
  projectId: number
  selectedIds: string[]
  onSelectionChange: (ids: string[], images: AIGeneratedImage[]) => void
  maxSelection: number
}

export function AIImagesSelector({
  projectId,
  selectedIds,
  onSelectionChange,
  maxSelection
}: AIImagesSelectorProps) {
  const { data: aiImages, isLoading, error } = useQuery<AIGeneratedImage[]>({
    queryKey: ['ai-images', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/ai-images`),
  })

  // Ensure aiImages is always an array
  const imagesList = Array.isArray(aiImages) ? aiImages : []

  // Initialize PhotoSwipe
  usePhotoSwipe({
    gallerySelector: '#ai-images-gallery',
    childSelector: 'a[data-pswp-src]',
    dependencies: [imagesList.length],
    enabled: imagesList.length > 0,
  })

  const handleToggle = (image: AIGeneratedImage) => {
    const isSelected = selectedIds.includes(image.id)

    if (isSelected) {
      const newIds = selectedIds.filter(id => id !== image.id)
      const newImages = imagesList.filter(img => newIds.includes(img.id))
      onSelectionChange(newIds, newImages)
    } else {
      if (selectedIds.length >= maxSelection) {
        return
      }
      const newIds = [...selectedIds, image.id]
      const newImages = imagesList.filter(img => newIds.includes(img.id))
      onSelectionChange(newIds, newImages)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-8 text-center border-dashed border-destructive/50">
        <Sparkles className="w-12 h-12 mx-auto mb-4 text-destructive" />
        <h3 className="font-semibold mb-1 text-destructive">Erro ao carregar imagens IA</h3>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Tente novamente mais tarde'}
        </p>
      </Card>
    )
  }

  if (!imagesList || imagesList.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="font-semibold mb-1">Nenhuma imagem IA disponível</h3>
        <p className="text-sm text-muted-foreground">
          Gere imagens com IA primeiro para usar nesta funcionalidade.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {imagesList.length} {imagesList.length === 1 ? 'imagem disponível' : 'imagens disponíveis'}
        </p>
        <Badge variant="secondary" className="font-mono">
          {selectedIds.length}/{maxSelection}
        </Badge>
      </div>

      <ScrollArea className="h-[400px] rounded-lg border p-3">
        <div id="ai-images-gallery" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {imagesList.map((image) => {
            const isSelected = selectedIds.includes(image.id)
            const canSelect = selectedIds.length < maxSelection || isSelected
            const selectionIndex = selectedIds.indexOf(image.id)
            const displayUrl = image.thumbnailUrl || image.fileUrl

            // Skip if no valid URL
            if (!displayUrl) {
              return null
            }

            return (
              <AIImageCard
                key={image.id}
                image={image}
                isSelected={isSelected}
                canSelect={canSelect}
                selectionIndex={selectionIndex}
                displayUrl={displayUrl}
                onToggle={handleToggle}
              />
            )
          })}
        </div>
      </ScrollArea>

      {selectedIds.length >= maxSelection && (
        <p className="text-sm text-amber-600 dark:text-amber-500 font-medium text-center">
          Limite de {maxSelection} {maxSelection === 1 ? 'imagem atingida' : 'imagens atingido'}
        </p>
      )}
    </div>
  )
}

// AIImageCard Component
interface AIImageCardProps {
  image: AIGeneratedImage
  isSelected: boolean
  canSelect: boolean
  selectionIndex: number
  displayUrl: string
  onToggle: (image: AIGeneratedImage) => void
}

function AIImageCard({
  image,
  isSelected,
  canSelect,
  selectionIndex,
  displayUrl,
  onToggle
}: AIImageCardProps) {
  const [imageDimensions, setImageDimensions] = React.useState({
    width: image.width || 1600,
    height: image.height || 1600
  })

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight
      })
    }
  }

  return (
    <div className="group relative">
      <Card
        className={cn(
          'relative transition-all overflow-hidden border-2',
          isSelected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-transparent hover:border-primary/50',
          !canSelect && 'opacity-50'
        )}
      >
        {/* Thumbnail */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          {/* PhotoSwipe link wrapper */}
          <a
            href={image.fileUrl}
            data-pswp-src={image.fileUrl}
            data-pswp-width={imageDimensions.width.toString()}
            data-pswp-height={imageDimensions.height.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={displayUrl}
              alt={image.name || 'Imagem IA selecionável'}
              fill
              sizes="(max-width: 768px) 45vw, 200px"
              className="object-cover"
              unoptimized
              onLoad={handleImageLoad}
            />
          </a>

          {/* AI Badge */}
          <div className="absolute top-2 left-2 z-10">
            <Badge variant="default" className="bg-purple-600 text-white gap-1 px-2 py-0.5 text-xs">
              <Sparkles className="w-3 h-3" />
              IA
            </Badge>
          </div>

          {/* Hover overlay with buttons */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2 pointer-events-auto">
              {/* Add to selection button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (canSelect) onToggle(image)
                }}
                disabled={!canSelect}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 shadow-lg transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isSelected ? "Remover da seleção" : "Adicionar à seleção"}
              >
                <Plus className={cn("h-5 w-5", isSelected && "rotate-45")} />
              </button>

              {/* View in lightbox button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const card = e.currentTarget.closest('.group')
                  const link = card?.querySelector('a[data-pswp-src]') as HTMLAnchorElement
                  if (link) {
                    const clickEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window
                    })
                    link.dispatchEvent(clickEvent)
                  }
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 shadow-lg transition-all hover:scale-110"
                title="Visualizar em tela cheia"
              >
                <Eye className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Selection indicator */}
          {isSelected && (
            <>
              {/* Check icon */}
              <div className="absolute top-2 right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg z-10">
                <Check className="w-5 h-5" />
              </div>

              {/* Selection number */}
              <div className="absolute bottom-2 right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold shadow-lg z-10">
                {selectionIndex + 1}
              </div>

              {/* Overlay */}
              <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
            </>
          )}
        </div>

        {/* Info */}
        <div className="p-2 bg-gradient-to-t from-black/60 to-transparent absolute bottom-0 left-0 right-0 pointer-events-none">
          <p className="text-xs font-medium text-white line-clamp-1" title={image.name}>
            {image.name}
          </p>
          <p className="text-xs text-white/70 line-clamp-1" title={image.prompt}>
            {image.prompt}
          </p>
        </div>
      </Card>
    </div>
  )
}
