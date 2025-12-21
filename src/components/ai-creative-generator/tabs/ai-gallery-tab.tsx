'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useProjectAIImages } from '@/hooks/use-project-ai-images'
import { Button } from '@/components/ui/button'
import { Loader2, ImageIcon, Check } from 'lucide-react'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface AIGalleryTabProps {
  projectId: number
  onImageSelected: (image: ImageSource) => void
}

export function AIGalleryTab({
  projectId,
  onImageSelected,
}: AIGalleryTabProps) {
  const { data: images, isLoading } = useProjectAIImages(projectId)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Carregando imagens geradas...
        </p>
      </div>
    )
  }

  if (!images || images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Nenhuma imagem gerada</p>
        <p className="mt-1 text-xs text-muted-foreground">
          As imagens criadas com IA aparecerão aqui
        </p>
      </div>
    )
  }

  function handleSelectImage(image: { fileUrl: string; prompt?: string; id: string }) {
    const imageSource: ImageSource = {
      type: 'ai-gallery',
      url: image.fileUrl,
      prompt: image.prompt,
      aiImageId: image.id,
    }
    setSelectedImageUrl(image.fileUrl)
    onImageSelected(imageSource)
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {images.length} {images.length === 1 ? 'imagem gerada' : 'imagens geradas'}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {images.map((image) => (
          <button
            key={image.id}
            onClick={() => handleSelectImage(image)}
            className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all hover:scale-105 ${
              selectedImageUrl === image.fileUrl
                ? 'border-primary shadow-lg'
                : 'border-border hover:border-primary/50'
            }`}
            title={image.prompt || 'Imagem gerada por IA'}
          >
            <Image
              src={image.fileUrl}
              alt={image.prompt || 'Imagem IA'}
              fill
              className="object-cover"
              unoptimized
            />

            {/* Overlay com prompt */}
            {image.prompt && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="line-clamp-2 text-xs text-white">
                  {image.prompt}
                </p>
              </div>
            )}

            {/* Checkbox de seleção */}
            {selectedImageUrl === image.fileUrl && (
              <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-lg">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
