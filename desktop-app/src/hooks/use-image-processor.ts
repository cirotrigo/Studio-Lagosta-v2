import { useState, useCallback } from 'react'
import { MAX_FILE_SIZE, ACCEPTED_IMAGE_TYPES, MAX_CAROUSEL_IMAGES, PostType } from '@/lib/constants'

export interface ProcessedImage {
  previewUrl: string
  blob: Blob
  fileName: string
  width: number
  height: number
  sizeBytes: number
}

export function useImageProcessor() {
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFiles = useCallback(async (files: File[], postType: PostType) => {
    setIsProcessing(true)
    setError(null)

    try {
      // Validate file count for carousel
      const maxImages = postType === 'CAROUSEL' ? MAX_CAROUSEL_IMAGES : 1
      if (processedImages.length + files.length > maxImages) {
        throw new Error(
          postType === 'CAROUSEL'
            ? `Máximo de ${MAX_CAROUSEL_IMAGES} imagens permitido`
            : 'Apenas uma imagem permitida para este tipo de post'
        )
      }

      const newImages: ProcessedImage[] = []

      for (const file of files) {
        // Validate file type
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          throw new Error(`Tipo de arquivo não suportado: ${file.type}`)
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`Arquivo muito grande. Máximo: 20MB`)
        }

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()

        // Process image via IPC (Sharp in main process)
        const result = await window.electronAPI.processImage(arrayBuffer, postType)

        // Create blob and preview URL
        const blob = new Blob([result.buffer], { type: 'image/jpeg' })
        const previewUrl = URL.createObjectURL(blob)

        newImages.push({
          previewUrl,
          blob,
          fileName: file.name.replace(/\.[^/.]+$/, '.jpg'),
          width: result.width,
          height: result.height,
          sizeBytes: result.sizeBytes,
        })
      }

      // For non-carousel, replace existing image
      if (postType !== 'CAROUSEL') {
        // Revoke old preview URLs
        processedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
        setProcessedImages(newImages)
      } else {
        // For carousel, append new images
        setProcessedImages((prev) => [...prev, ...newImages])
      }
    } catch (err) {
      console.error('Error processing images:', err)
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem')
    } finally {
      setIsProcessing(false)
    }
  }, [processedImages])

  const removeImage = useCallback((index: number) => {
    setProcessedImages((prev) => {
      const image = prev[index]
      if (image) {
        URL.revokeObjectURL(image.previewUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const clearImages = useCallback(() => {
    processedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    setProcessedImages([])
  }, [processedImages])

  return {
    processedImages,
    isProcessing,
    error,
    processFiles,
    removeImage,
    clearImages,
  }
}
