import { useCallback, useState } from 'react'
import { Upload, X, Loader2, Crop } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import { PostType, MAX_CAROUSEL_IMAGES, ACCEPTED_IMAGE_TYPES } from '@/lib/constants'
import { ProcessedImage } from '@/hooks/use-image-processor'

interface ImageDropzoneProps {
  postType: PostType
  onFilesSelected: (files: File[]) => void
  isProcessing: boolean
  processedImages: ProcessedImage[]
  onRemoveImage: (index: number) => void
  onEditCrop?: (index: number) => void
}

export default function ImageDropzone({
  postType,
  onFilesSelected,
  isProcessing,
  processedImages,
  onRemoveImage,
  onEditCrop,
}: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const maxImages = postType === 'CAROUSEL' ? MAX_CAROUSEL_IMAGES : 1
  const canAddMore = processedImages.length < maxImages
  const aspectClass = (postType === 'STORY' || postType === 'REEL') ? 'aspect-[9/16]' : 'aspect-[4/5]'

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      if (!canAddMore || isProcessing) return

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        ACCEPTED_IMAGE_TYPES.includes(file.type)
      )

      if (files.length > 0) {
        onFilesSelected(files)
      }
    },
    [canAddMore, isProcessing, onFilesSelected]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canAddMore || isProcessing) return

      const files = Array.from(e.target.files || []).filter((file) =>
        ACCEPTED_IMAGE_TYPES.includes(file.type)
      )

      if (files.length > 0) {
        onFilesSelected(files)
      }

      // Reset input
      e.target.value = ''
    },
    [canAddMore, isProcessing, onFilesSelected]
  )

  return (
    <div className="space-y-3">
      {/* Processed images */}
      {processedImages.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {processedImages.map((image, index) => (
            <div
              key={index}
              className={cn('group relative overflow-hidden rounded-lg bg-input', aspectClass)}
            >
              <img
                src={image.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              {/* Remove button */}
              <button
                onClick={() => onRemoveImage(index)}
                className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              >
                <X size={14} />
              </button>
              {/* Crop button */}
              {onEditCrop && (
                <button
                  onClick={() => onEditCrop(index)}
                  className="absolute left-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  title="Ajustar crop"
                >
                  <Crop size={14} />
                </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2">
                <p className="text-xs text-white">
                  {image.width}×{image.height} • {formatFileSize(image.sizeBytes)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      {canAddMore && (
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed',
            'transition-all duration-200',
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-border bg-input hover:border-primary/50',
            isProcessing && 'pointer-events-none opacity-50'
          )}
        >
          <input
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            multiple={postType === 'CAROUSEL'}
            onChange={handleFileInput}
            disabled={isProcessing}
            className="hidden"
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm text-text-muted">Processando imagem...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Upload size={24} className="text-primary" />
              </div>
              <div>
                <p className="font-medium text-text">
                  Arraste imagens ou clique para selecionar
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  JPEG, PNG ou WebP (máx. 20MB)
                </p>
                {postType === 'CAROUSEL' && (
                  <p className="mt-1 text-xs text-text-subtle">
                    {processedImages.length}/{MAX_CAROUSEL_IMAGES} imagens
                  </p>
                )}
              </div>
            </div>
          )}
        </label>
      )}
    </div>
  )
}
