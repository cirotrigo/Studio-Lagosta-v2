'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Image as ImageIcon, Check, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface Generation {
  id: string
  templateName: string
  resultUrl: string
  thumbnailUrl?: string | null
  createdAt: string
}

// Helper to detect if a URL is a video
function isVideoUrl(url: string): boolean {
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {generationsList.map((gen) => {
            const isSelected = selectedIds.includes(gen.id)
            const canSelect = selectedIds.length < maxSelection || isSelected
            const selectionIndex = selectedIds.indexOf(gen.id)
            const isVideo = isVideoUrl(gen.resultUrl)
            const displayUrl = isVideo && gen.thumbnailUrl ? gen.thumbnailUrl : gen.resultUrl

            return (
              <Card
                key={gen.id}
                className={cn(
                  'relative cursor-pointer transition-all overflow-hidden border-2',
                  isSelected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-transparent hover:border-primary/50',
                  !canSelect && 'opacity-50 cursor-not-allowed'
                )}
                onClick={() => canSelect && handleToggle(gen)}
              >
                {/* Thumbnail */}
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <Image
                    src={displayUrl}
                    alt={gen.templateName || 'Criativo selecionável'}
                    fill
                    sizes="(max-width: 768px) 45vw, 200px"
                    className="object-cover"
                    unoptimized
                  />

                  {/* Video indicator */}
                  {isVideo && !isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                      <div className="bg-white/90 rounded-full p-2">
                        <Play className="w-4 h-4 text-black" fill="black" />
                      </div>
                    </div>
                  )}

                  {/* Selection indicator */}
                  {isSelected && (
                    <>
                      {/* Check icon */}
                      <div className="absolute top-2 right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg">
                        <Check className="w-5 h-5" />
                      </div>

                      {/* Selection number */}
                      <div className="absolute top-2 left-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                        {selectionIndex + 1}
                      </div>

                      {/* Overlay */}
                      <div className="absolute inset-0 bg-primary/10" />
                    </>
                  )}
                </div>

                {/* Info */}
                <div className="p-2 bg-gradient-to-t from-black/60 to-transparent absolute bottom-0 left-0 right-0">
                  <p className="text-xs font-medium text-white line-clamp-1" title={gen.templateName}>
                    {gen.templateName}
                  </p>
                  <p className="text-xs text-white/70">
                    {new Date(gen.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short'
                    })}
                  </p>
                </div>
              </Card>
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
