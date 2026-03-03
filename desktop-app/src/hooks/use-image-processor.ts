import { useState, useCallback } from 'react'
import { MAX_FILE_SIZE, ACCEPTED_IMAGE_TYPES, MAX_CAROUSEL_IMAGES, PostType } from '@/lib/constants'

export interface ProcessedImage {
  previewUrl: string
  blob: Blob
  fileName: string
  width: number
  height: number
  sizeBytes: number
  originalArrayBuffer?: ArrayBuffer // Store original for reprocessing
  originalPreviewUrl?: string // Preview of original image for crop editor
  originalWidth?: number
  originalHeight?: number
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

        // Read file as ArrayBuffer and store original
        const originalArrayBuffer = await file.arrayBuffer()
        
        // Create original preview URL (for crop editor)
        const originalBlob = new Blob([originalArrayBuffer], { type: file.type })
        const originalPreviewUrl = URL.createObjectURL(originalBlob)
        
        // Get original image dimensions
        const originalImg = new Image()
        await new Promise((resolve, reject) => {
          originalImg.onload = resolve
          originalImg.onerror = reject
          originalImg.src = originalPreviewUrl
        })

        // Process image via IPC (Sharp in main process)
        const result = await window.electronAPI.processImage(originalArrayBuffer, postType)

        // Create blob and preview URL for processed image
        const blob = new Blob([result.buffer], { type: 'image/jpeg' })
        const previewUrl = URL.createObjectURL(blob)

        newImages.push({
          previewUrl,
          blob,
          fileName: file.name.replace(/\.[^/.]+$/, '.jpg'),
          width: result.width,
          height: result.height,
          sizeBytes: result.sizeBytes,
          originalArrayBuffer, // Store for reprocessing
          originalPreviewUrl, // Preview of original for crop editor
          originalWidth: originalImg.naturalWidth,
          originalHeight: originalImg.naturalHeight,
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
        if (image.originalPreviewUrl) {
          URL.revokeObjectURL(image.originalPreviewUrl)
        }
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const clearImages = useCallback(() => {
    processedImages.forEach((img) => {
      URL.revokeObjectURL(img.previewUrl)
      if (img.originalPreviewUrl) {
        URL.revokeObjectURL(img.originalPreviewUrl)
      }
    })
    setProcessedImages([])
  }, [processedImages])

  const reorderImages = useCallback((newOrder: ProcessedImage[]) => {
    setProcessedImages(newOrder)
  }, [])

  // Reprocess a single image with custom crop
  const reprocessImage = useCallback(async (
    index: number,
    postType: PostType,
    cropRegion: { left: number; top: number; width: number; height: number }
  ) => {
    const image = processedImages[index]
    if (!image?.originalArrayBuffer) {
      throw new Error('Original image data not available')
    }

    setIsProcessing(true)
    setError(null)

    try {
      // Reprocess with custom crop
      const result = await window.electronAPI.processImage(
        image.originalArrayBuffer,
        postType,
        cropRegion
      )

      // Revoke old preview URL (processed only, keep original)
      URL.revokeObjectURL(image.previewUrl)

      // Create new blob and preview URL for processed image
      const blob = new Blob([result.buffer], { type: 'image/jpeg' })
      const previewUrl = URL.createObjectURL(blob)

      // Update the image at index
      const newImages = [...processedImages]
      newImages[index] = {
        ...image,
        previewUrl,
        blob,
        width: result.width,
        height: result.height,
        sizeBytes: result.sizeBytes,
        // Keep originalPreviewUrl, originalWidth, originalHeight, originalArrayBuffer
      }

      setProcessedImages(newImages)
    } catch (err) {
      console.error('Error reprocessing image:', err)
      setError(err instanceof Error ? err.message : 'Erro ao reprocessar imagem')
      throw err
    } finally {
      setIsProcessing(false)
    }
  }, [processedImages])

  return {
    processedImages,
    isProcessing,
    error,
    processFiles,
    removeImage,
    clearImages,
    reorderImages,
    reprocessImage,
  }
}
