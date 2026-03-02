import sharp from 'sharp'

export interface ProcessedImageResult {
  buffer: ArrayBuffer
  width: number
  height: number
  sizeBytes: number
}

// Dimensions based on post type
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  POST: { width: 1080, height: 1350 },
  CAROUSEL: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
  REEL: { width: 1080, height: 1920 },
}

export async function processImage(
  inputBuffer: Buffer,
  postType: string
): Promise<ProcessedImageResult> {
  const dimensions = DIMENSIONS[postType] || DIMENSIONS.POST

  const { width, height } = dimensions

  // Process image with Sharp
  const processedBuffer = await sharp(inputBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'attention', // Smart crop
    })
    .jpeg({ quality: 90 })
    .toBuffer()

  // Get metadata of processed image
  const metadata = await sharp(processedBuffer).metadata()

  return {
    buffer: processedBuffer.buffer.slice(
      processedBuffer.byteOffset,
      processedBuffer.byteOffset + processedBuffer.byteLength
    ),
    width: metadata.width || width,
    height: metadata.height || height,
    sizeBytes: processedBuffer.length,
  }
}
