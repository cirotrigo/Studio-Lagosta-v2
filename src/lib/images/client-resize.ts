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

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      if (!e.target?.result) {
        reject(new Error('Failed to read file'))
        return
      }

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
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

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'))
                return
              }

              // Create new file from blob
              const resizedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })

              console.log(
                `📐 Client-side resize: ${sourceWidth}x${sourceHeight} → ${targetWidth}x${targetHeight}`
              )

              resolve(resizedFile)
            },
            'image/jpeg',
            quality
          )
        } catch (error) {
          reject(error)
        }
      }

      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }

      img.src = e.target.result as string
    }

    reader.onerror = () => {
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
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/**
 * Check if a file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/')
}
