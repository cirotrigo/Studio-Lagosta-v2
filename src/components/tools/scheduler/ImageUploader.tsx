"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, Loader2, AlertCircle } from 'lucide-react'

export interface ProcessedImage {
  localPreviewUrl: string
  processedBlob: Blob
  format: string
  fileName: string
}

interface ImageUploaderProps {
  postType: string
  images: ProcessedImage[]
  onChange: (images: ProcessedImage[]) => void
  maxImages?: number
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageUploader({ postType, images, onChange, maxImages = 10 }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const isCarousel = postType === 'CAROUSEL'
  const canAddMore = isCarousel ? images.length < maxImages : images.length < 1

  // Cleanup object URLs on unmount
  React.useEffect(() => {
    return () => {
      images.forEach((img) => {
        try { URL.revokeObjectURL(img.localPreviewUrl) } catch { /* noop */ }
      })
    }
  }, [])

  const processFiles = async (files: File[]) => {
    setError(null)
    setProcessing(true)

    try {
      const validFiles = files.filter((f) => ACCEPTED_TYPES.includes(f.type))
      if (validFiles.length === 0) {
        setError('Formato inválido. Aceitos: JPEG, PNG, WebP')
        setProcessing(false)
        return
      }

      const slotsLeft = isCarousel ? maxImages - images.length : 1
      const filesToProcess = validFiles.slice(0, slotsLeft)

      const newImages: ProcessedImage[] = []

      for (const file of filesToProcess) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('postType', postType)

        const response = await fetch('/api/tools/process-image', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Erro ao processar imagem' }))
          throw new Error(err.error || 'Erro ao processar imagem')
        }

        const blob = await response.blob()
        const previewUrl = URL.createObjectURL(blob)

        newImages.push({
          localPreviewUrl: previewUrl,
          processedBlob: blob,
          format: postType === 'STORY' || postType === 'REEL' ? 'story' : 'feed',
          fileName: file.name.replace(/\.[^.]+$/, '.jpg'),
        })
      }

      if (isCarousel) {
        onChange([...images, ...newImages])
      } else {
        // Single image: replace existing
        images.forEach((img) => {
          try { URL.revokeObjectURL(img.localPreviewUrl) } catch { /* noop */ }
        })
        onChange(newImages)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem')
    } finally {
      setProcessing(false)
    }
  }

  const removeImage = (index: number) => {
    const removed = images[index]
    try { URL.revokeObjectURL(removed.localPreviewUrl) } catch { /* noop */ }
    onChange(images.filter((_, i) => i !== index))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    processFiles(files)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      {/* Image thumbnails (for carousel or single) */}
      {images.length > 0 && (
        <div className={cn('flex gap-2 flex-wrap', isCarousel && 'grid grid-cols-5 gap-2')}>
          {images.map((img, i) => (
            <div
              key={i}
              className="relative group rounded-lg overflow-hidden border border-[#27272A] bg-[#1a1a1a] aspect-square"
            >
              <img
                src={img.localPreviewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <X className="h-3 w-3" />
              </button>
              {isCarousel && (
                <div className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[9px] font-bold text-white">
                  {i + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {canAddMore && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 px-4 cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-amber-500 bg-amber-500/5'
              : 'border-[#27272A] bg-[#1a1a1a] hover:border-[#3f3f46]',
            processing && 'pointer-events-none opacity-60'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={isCarousel}
            onChange={handleFileSelect}
            className="hidden"
          />
          {processing ? (
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          ) : (
            <Upload className="h-8 w-8 text-[#3f3f46]" />
          )}
          <div className="text-center">
            <p className="text-xs font-medium text-[#A1A1AA]">
              {processing ? 'Processando imagem...' : 'Arraste ou clique para adicionar'}
            </p>
            <p className="text-[10px] text-[#71717A] mt-0.5">
              JPEG, PNG ou WebP {isCarousel ? `(até ${maxImages} imagens)` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}
