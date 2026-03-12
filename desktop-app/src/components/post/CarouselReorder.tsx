import { useState, useCallback } from 'react'
import { GripVertical, X, ChevronLeft, ChevronRight, Crop } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import { ProcessedImage } from '@/hooks/use-image-processor'

interface CarouselReorderProps {
  images: ProcessedImage[]
  onReorder: (images: ProcessedImage[]) => void
  onRemove: (index: number) => void
  onEditCrop?: (index: number) => void
}

export default function CarouselReorder({ images, onReorder, onRemove, onEditCrop }: CarouselReorderProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    
    // Set drag image
    const target = e.currentTarget as HTMLElement
    if (target) {
      e.dataTransfer.setDragImage(target, 20, 20)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }, [dragOverIndex])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)

    const dragIndex = Number(e.dataTransfer.getData('text/plain'))
    
    if (dragIndex === dropIndex || isNaN(dragIndex)) {
      setDraggedIndex(null)
      return
    }

    // Reorder images
    const newImages = [...images]
    const [removed] = newImages.splice(dragIndex, 1)
    newImages.splice(dropIndex, 0, removed)
    
    onReorder(newImages)
    setDraggedIndex(null)
  }, [images, onReorder])

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newImages = [...images]
    const [removed] = newImages.splice(index, 1)
    newImages.splice(index - 1, 0, removed)
    onReorder(newImages)
  }

  const handleMoveDown = (index: number) => {
    if (index === images.length - 1) return
    const newImages = [...images]
    const [removed] = newImages.splice(index, 1)
    newImages.splice(index + 1, 0, removed)
    onReorder(newImages)
  }

  if (images.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text">
          Ordem das imagens
        </label>
        <span className="text-xs text-text-muted">
          Arraste para reordenar
        </span>
      </div>

      <div className="space-y-2">
        {images.map((image, index) => (
          <div
            key={`${image.previewUrl}-${index}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              'group flex items-center gap-3 rounded-lg border p-2 transition-all duration-200',
              'cursor-move hover:border-primary/50 hover:bg-input',
              dragOverIndex === index && 'border-primary bg-primary/10',
              draggedIndex === index && 'opacity-50'
            )}
          >
            {/* Drag handle */}
            <div className="flex flex-col items-center gap-1">
              <GripVertical size={16} className="text-text-muted" />
              <span className="text-xs font-medium text-text-muted">
                {index + 1}
              </span>
            </div>

            {/* Thumbnail */}
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-input">
              <img
                src={image.previewUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text truncate">
                Imagem {index + 1}
              </p>
              <p className="text-xs text-text-muted">
                {image.width}×{image.height} • {formatFileSize(image.sizeBytes)}
              </p>
            </div>

            {/* Move buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="rounded p-1 text-text-muted hover:bg-card hover:text-text disabled:opacity-30"
                title="Mover para cima"
              >
                <ChevronLeft size={16} className="rotate-90" />
              </button>
              <button
                onClick={() => handleMoveDown(index)}
                disabled={index === images.length - 1}
                className="rounded p-1 text-text-muted hover:bg-card hover:text-text disabled:opacity-30"
                title="Mover para baixo"
              >
                <ChevronRight size={16} className="rotate-90" />
              </button>
            </div>

            {/* Crop button */}
            {onEditCrop && (
              <button
                onClick={() => onEditCrop(index)}
                className="rounded p-1.5 text-primary/70 hover:bg-primary/10 hover:text-primary"
                title="Editar crop"
              >
                <Crop size={16} />
              </button>
            )}

            {/* Remove button */}
            <button
              onClick={() => onRemove(index)}
              className="rounded p-1.5 text-error/70 hover:bg-error/10 hover:text-error"
              title="Remover imagem"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
