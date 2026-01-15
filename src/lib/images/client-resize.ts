/**
 * Client-side image resizing utilities
 * Uses Canvas API to resize images before upload
 */

export interface ResizeOptions {
  targetWidth: number
  targetHeight: number
  quality?: number // 0.0 to 1.0
}

/**
 * Instagram Feed Post dimensions: 1080x1350 (4:5 ratio)
 */
export const INSTAGRAM_FEED_DIMENSIONS = {
  width: 1080,
  height: 1350,
  ratio: 4 / 5,
}

/**
 * Resize and crop image to target dimensions using canvas
 */
export async function resizeImage(
  file: File,
  options: ResizeOptions
): Promise<File> {
  const { targetWidth, targetHeight, quality = 0.92 } = options

  console.log('[Resize] Starting resize:', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    targetWidth,
    targetHeight
  })

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      if (!e.target?.result) {
        console.error('[Resize] Failed to read file - no result')
        reject(new Error('Failed to read file'))
        return
      }

      console.log('[Resize] File read successfully, loading image...')

      img.onload = () => {
        try {
          console.log('[Resize] Image loaded:', {
            width: img.width,
            height: img.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
          })

          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            console.error('[Resize] Failed to get canvas 2d context')
            reject(new Error('Failed to get canvas context'))
            return
          }

          const sourceWidth = img.width
          const sourceHeight = img.height
          const sourceRatio = sourceWidth / sourceHeight
          const targetRatio = targetWidth / targetHeight

          let cropWidth: number
          let cropHeight: number
          let offsetX = 0
          let offsetY = 0

          if (sourceRatio > targetRatio) {
            // Image is wider than target - crop horizontally (sides)
            cropHeight = sourceHeight
            cropWidth = Math.round(cropHeight * targetRatio)
            offsetX = Math.round((sourceWidth - cropWidth) / 2)
          } else {
            // Image is taller than target - crop vertically (top/bottom)
            cropWidth = sourceWidth
            cropHeight = Math.round(cropWidth / targetRatio)
            offsetY = Math.round((sourceHeight - cropHeight) / 2)
          }

          console.log('[Resize] Crop calculation:', {
            sourceRatio: sourceRatio.toFixed(2),
            targetRatio: targetRatio.toFixed(2),
            cropWidth,
            cropHeight,
            offsetX,
            offsetY
          })

          // Set canvas to target dimensions
          canvas.width = targetWidth
          canvas.height = targetHeight

          // Draw cropped and resized image
          ctx.drawImage(
            img,
            offsetX,
            offsetY,
            cropWidth,
            cropHeight,
            0,
            0,
            targetWidth,
            targetHeight
          )

          console.log('[Resize] Image drawn to canvas, converting to blob...')

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                console.error('[Resize] Failed to create blob from canvas')
                reject(new Error('Failed to create blob'))
                return
              }

              // Create new file from blob
              const resizedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })

              console.log(
                `📐 [Resize] Complete: ${sourceWidth}x${sourceHeight} → ${targetWidth}x${targetHeight} (${Math.round(resizedFile.size / 1024)}KB)`
              )

              resolve(resizedFile)
            },
            'image/jpeg',
            quality
          )
        } catch (error) {
          console.error('[Resize] Error during canvas processing:', error)
          reject(error)
        }
      }

      img.onerror = (e) => {
        console.error('[Resize] Failed to load image:', e)
        reject(new Error('Failed to load image'))
      }

      img.src = e.target.result as string
    }

    reader.onerror = (e) => {
      console.error('[Resize] Failed to read file:', e)
      reject(new Error('Failed to read file'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Resize image to Instagram feed dimensions (1080x1350)
 */
export async function resizeToInstagramFeed(file: File): Promise<File> {
  return resizeImage(file, {
    targetWidth: INSTAGRAM_FEED_DIMENSIONS.width,
    targetHeight: INSTAGRAM_FEED_DIMENSIONS.height,
    quality: 0.92,
  })
}

/**
 * Image file extensions for fallback detection
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.svg']

/**
 * Check if a file is an image
 * Uses MIME type first, falls back to extension check for drag-and-drop scenarios
 * where browser may not set the file.type correctly
 */
export function isImageFile(file: File): boolean {
  // First, check MIME type (most reliable when available)
  if (file.type && file.type.startsWith('image/')) {
    return true
  }

  // Fallback: check file extension (for drag-and-drop scenarios)
  const fileName = file.name.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => fileName.endsWith(ext))
}

/**
 * Video file extensions for fallback detection
 */
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']

/**
 * Check if a file is a video
 * Uses MIME type first, falls back to extension check for drag-and-drop scenarios
 */
export function isVideoFile(file: File): boolean {
  // First, check MIME type (most reliable when available)
  if (file.type && file.type.startsWith('video/')) {
    return true
  }

  // Fallback: check file extension
  const fileName = file.name.toLowerCase()
  return VIDEO_EXTENSIONS.some(ext => fileName.endsWith(ext))
}
