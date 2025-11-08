'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Image as ImageIcon, Check, Play, Eye, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { usePhotoSwipe } from '@/hooks/use-photoswipe'

interface Generation {
  id: string
  templateName: string
  resultUrl: string
  thumbnailUrl?: string | null
  createdAt: string
}

// Helper to detect if a URL is a video
function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.m4v']
  const lowerUrl = url.toLowerCase()
  return videoExtensions.some(ext => lowerUrl.includes(ext))
}

interface GenerationsSelectorProps {
  projectId: number
  selectedIds: string[]
  onSelectionChange: (ids: string[], generations: Generation[]) => void
  maxSelection: number
}

export function GenerationsSelector({
  projectId,
  selectedIds,
  onSelectionChange,
  maxSelection
}: GenerationsSelectorProps) {
  const { data: generations, isLoading, error } = useQuery<Generation[]>({
    queryKey: ['generations', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/creatives`),
  })

  // Ensure generations is always an array
  const generationsList = Array.isArray(generations) ? generations : []

  // Initialize PhotoSwipe - must be called before any conditional returns
  usePhotoSwipe({
    gallerySelector: '#generations-gallery',
    childSelector: 'a[data-pswp-src]',
    dependencies: [generationsList.length],
  })

  const handleToggle = (generation: Generation) => {
    const isSelected = selectedIds.includes(generation.id)

    if (isSelected) {
      const newIds = selectedIds.filter(id => id !== generation.id)
      const newGenerations = generationsList.filter(g => newIds.includes(g.id))
      onSelectionChange(newIds, newGenerations)
    } else {
      if (selectedIds.length >= maxSelection) {
        return
      }
      const newIds = [...selectedIds, generation.id]
      const newGenerations = generationsList.filter(g => newIds.includes(g.id))
      onSelectionChange(newIds, newGenerations)
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
        <ImageIcon className="w-12 h-12 mx-auto mb-4 text-destructive" />
        <h3 className="font-semibold mb-1 text-destructive">Erro ao carregar criativos</h3>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Tente novamente mais tarde'}
        </p>
      </Card>
    )
  }

  if (!generationsList || generationsList.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="font-semibold mb-1">Nenhum criativo disponível</h3>
        <p className="text-sm text-muted-foreground">
          Crie um template e exporte criativos primeiro para usar nesta funcionalidade.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {generationsList.length} {generationsList.length === 1 ? 'criativo disponível' : 'criativos disponíveis'}
        </p>
        <Badge variant="secondary" className="font-mono">
          {selectedIds.length}/{maxSelection}
        </Badge>
      </div>

      <ScrollArea className="h-[400px] rounded-lg border p-3">
        <div id="generations-gallery" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {generationsList.map((gen) => {
            const isSelected = selectedIds.includes(gen.id)
            const canSelect = selectedIds.length < maxSelection || isSelected
            const selectionIndex = selectedIds.indexOf(gen.id)
            const isVideo = isVideoUrl(gen.resultUrl)
            const displayUrl = isVideo && gen.thumbnailUrl ? gen.thumbnailUrl : gen.resultUrl

            // Skip if no valid URL
            if (!displayUrl) {
              return null
            }

            return (
              <GenerationCard
                key={gen.id}
                generation={gen}
                isSelected={isSelected}
                canSelect={canSelect}
                selectionIndex={selectionIndex}
                isVideo={isVideo}
                displayUrl={displayUrl}
                onToggle={handleToggle}
              />
            )
          })}
        </div>
      </ScrollArea>

      {selectedIds.length >= maxSelection && (
        <p className="text-sm text-amber-600 dark:text-amber-500 font-medium text-center">
          Limite de {maxSelection} {maxSelection === 1 ? 'criativo atingido' : 'criativos atingido'}
        </p>
      )}
    </div>
  )
}

// GenerationCard Component
interface GenerationCardProps {
  generation: Generation
  isSelected: boolean
  canSelect: boolean
  selectionIndex: number
  isVideo: boolean
  displayUrl: string
  onToggle: (gen: Generation) => void
}

function GenerationCard({
  generation,
  isSelected,
  canSelect,
  selectionIndex,
  isVideo,
  displayUrl,
  onToggle
}: GenerationCardProps) {
  const [imageDimensions, setImageDimensions] = React.useState({ width: 1600, height: 1600 })

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
            href={generation.resultUrl}
            data-pswp-src={generation.resultUrl}
            data-pswp-width={imageDimensions.width.toString()}
            data-pswp-height={imageDimensions.height.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={displayUrl}
              alt={generation.templateName || 'Criativo selecionável'}
              fill
              sizes="(max-width: 768px) 45vw, 200px"
              className="object-cover"
              unoptimized
              onLoad={handleImageLoad}
            />
          </a>

          {/* Video indicator */}
          {isVideo && !isSelected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="bg-white/90 rounded-full p-2">
                <Play className="w-4 h-4 text-black" fill="black" />
              </div>
            </div>
          )}

          {/* Hover overlay with buttons */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2 pointer-events-auto">
              {/* Add to selection button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (canSelect) onToggle(generation)
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
                  // Trigger PhotoSwipe by dispatching click event on the link
                  const card = e.currentTarget.closest('.group')
                  const link = card?.querySelector('a[data-pswp-src]') as HTMLAnchorElement
                  if (link) {
                    console.log('👁️ Eye button clicked, dispatching click on link:', link.href)
                    // Dispatch a real click event that PhotoSwipe will intercept
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
              <div className="absolute top-2 left-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold shadow-lg z-10">
                {selectionIndex + 1}
              </div>

              {/* Overlay */}
              <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
            </>
          )}
        </div>

        {/* Info */}
        <div className="p-2 bg-gradient-to-t from-black/60 to-transparent absolute bottom-0 left-0 right-0 pointer-events-none">
          <p className="text-xs font-medium text-white line-clamp-1" title={generation.templateName}>
            {generation.templateName}
          </p>
          <p className="text-xs text-white/70">
            {new Date(generation.createdAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short'
            })}
          </p>
        </div>
      </Card>
    </div>
  )
}
