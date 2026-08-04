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
 * Dimensões finais por tipo de post — as mesmas do app desktop
 * (`desktop-app/electron/ipc/image-processor.ts`) e do
 * `/api/tools/process-image`. Mudou aqui, mude nos três.
 */
export const POST_TYPE_DIMENSIONS = {
  POST: { width: 1080, height: 1350 },
  CAROUSEL: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
  REEL: { width: 1080, height: 1920 },
} as const

export type CropPostType = keyof typeof POST_TYPE_DIMENSIONS

/** Região recortada, em pixels da imagem ORIGINAL */
export interface CropRegion {
  left: number
  top: number
  width: number
  height: number
}

/** Lê as dimensões naturais de um arquivo de imagem */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(size)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem'))
    }
    img.src = url
  })
}

/**
 * Dimensões naturais de uma imagem que já está numa URL.
 *
 * Sem `crossOrigin`: só lemos `naturalWidth/Height`, que não exige CORS — pedir
 * `anonymous` faria a imagem do Drive (sem cabeçalho CORS) falhar à toa.
 */
export function readImageSizeFromUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Não foi possível ler a imagem'))
    img.src = url
  })
}

/**
 * Recorta a região escolhida e devolve o arquivo no tamanho final do formato.
 *
 * Sem `cropRegion` cai no comportamento antigo (corte pelo CENTRO), que é o
 * padrão quando a pessoa não quer escolher enquadramento.
 */
export async function cropToPostType(
  file: File,
  postType: CropPostType,
  cropRegion?: CropRegion,
): Promise<File> {
  const target = POST_TYPE_DIMENSIONS[postType]

  if (!cropRegion) {
    return resizeImage(file, {
      targetWidth: target.width,
      targetHeight: target.height,
      quality: 0.92,
    })
  }

  const bitmap = await createImageBitmap(file)
  try {
    // Nunca pedir ao canvas um pedaço fora da imagem: `drawImage` com origem
    // fora dos limites desenha transparente e o JPEG sai com faixa preta
    const left = Math.max(0, Math.min(Math.round(cropRegion.left), bitmap.width - 1))
    const top = Math.max(0, Math.min(Math.round(cropRegion.top), bitmap.height - 1))
    const width = Math.max(1, Math.min(Math.round(cropRegion.width), bitmap.width - left))
    const height = Math.max(1, Math.min(Math.round(cropRegion.height), bitmap.height - top))

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, left, top, width, height, 0, 0, target.width, target.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob) throw new Error('Falha ao gerar a imagem recortada')

    const name = file.name.replace(/\.[^.]+$/, '') || 'imagem'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
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
