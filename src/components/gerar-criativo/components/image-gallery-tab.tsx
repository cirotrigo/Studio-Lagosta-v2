'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Skeleton } from '@/components/ui/skeleton'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageGalleryTabProps {
  projectId: number
  onImageSelected: (url: string, aiImageId?: string) => void
}

interface AIImage {
  id: string
  fileUrl: string
  prompt: string
  createdAt: string
}

export function ImageGalleryTab({ projectId, onImageSelected }: ImageGalleryTabProps) {
  const { data: images, isLoading } = useQuery<AIImage[]>({
    queryKey: ['project-images', projectId],
    queryFn: () => api.get<AIImage[]>(`/api/projects/${projectId}/ai-images`),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    )
  }

  if (!images || images.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">Nenhuma imagem na galeria</p>
        <p className="text-xs mt-1">Gere imagens com IA para adicionar a galeria</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
      {images.map((image) => (
        <button
          key={image.id}
          onClick={() => onImageSelected(image.fileUrl, image.id)}
          className={cn(
            'aspect-square rounded-md overflow-hidden border-2 border-transparent',
            'hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary'
          )}
        >
          <img src={image.fileUrl} alt={image.prompt} className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  )
}
