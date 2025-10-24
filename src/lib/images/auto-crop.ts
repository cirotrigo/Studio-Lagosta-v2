import sharp from 'sharp'

/**
 * Instagram Feed Post dimensions: 1080x1350 (4:5 ratio)
 * This function crops and resizes images to fit Instagram's feed requirements
 */
export async function cropToInstagramFeed(buffer: Buffer): Promise<Buffer> {
  const TARGET_WIDTH = 1080
  const TARGET_HEIGHT = 1350
  const TARGET_RATIO = 4 / 5 // 0.8

  try {
    const image = sharp(buffer)
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to read image dimensions')
    }

    const sourceWidth = metadata.width
    const sourceHeight = metadata.height
    const sourceRatio = sourceWidth / sourceHeight

    let cropWidth: number
    let cropHeight: number
    let left = 0
    let top = 0

    if (sourceRatio > TARGET_RATIO) {
      // Image is wider than target - crop horizontally (sides)
      cropHeight = sourceHeight
      cropWidth = Math.round(cropHeight * TARGET_RATIO)
      left = Math.round((sourceWidth - cropWidth) / 2)
    } else {
      // Image is taller than target - crop vertically (top/bottom)
      cropWidth = sourceWidth
      cropHeight = Math.round(cropWidth / TARGET_RATIO)
      top = Math.round((sourceHeight - cropHeight) / 2)
    }

    // Crop and resize to exact Instagram dimensions
    const processedBuffer = await image
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: 'cover',
        position: 'centre',
      })
      .jpeg({ quality: 90 }) // High quality JPEG
      .toBuffer()

    console.log(`📐 Image cropped from ${sourceWidth}x${sourceHeight} to ${TARGET_WIDTH}x${TARGET_HEIGHT}`)

    return processedBuffer
  } catch (error) {
    console.error('Error cropping image:', error)
    throw new Error(`Failed to crop image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check if image needs cropping (is not already 4:5 ratio)
 */
export async function needsCropping(buffer: Buffer): Promise<boolean> {
  try {
    const image = sharp(buffer)
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      return false
    }

    const ratio = metadata.width / metadata.height
    const targetRatio = 4 / 5

    // Allow 1% tolerance
    return Math.abs(ratio - targetRatio) > 0.01
  } catch (error) {
    console.error('Error checking image ratio:', error)
    return false
  }
}

/**
 * Get image info without processing
 */
export async function getImageInfo(buffer: Buffer): Promise<{
  width: number
  height: number
  ratio: number
  format: string
}> {
  const image = sharp(buffer)
  const metadata = await image.metadata()

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    ratio: metadata.width && metadata.height ? metadata.width / metadata.height : 0,
    format: metadata.format || 'unknown',
  }
}
