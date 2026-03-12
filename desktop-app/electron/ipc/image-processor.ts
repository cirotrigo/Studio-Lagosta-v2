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
  postType: string,
  cropRegion?: { left: number; top: number; width: number; height: number }
): Promise<ProcessedImageResult> {
  const dimensions = DIMENSIONS[postType] || DIMENSIONS.POST
  const { width, height } = dimensions

  console.log('[ImageProcessor] Processing image:', {
    postType,
    targetDimensions: dimensions,
    cropRegion,
    inputBufferSize: inputBuffer.length
  })

  let pipeline = sharp(inputBuffer)

  // If custom crop region provided, extract and resize to target
  if (cropRegion) {
    console.log('[ImageProcessor] Applying custom crop:', cropRegion)
    
    // Validate crop region
    const metadata = await sharp(inputBuffer).metadata()
    console.log('[ImageProcessor] Original image metadata:', {
      width: metadata.width,
      height: metadata.height
    })
    
    // Ensure crop region is within bounds
    const safeLeft = Math.max(0, Math.min(cropRegion.left, (metadata.width || 0) - 1))
    const safeTop = Math.max(0, Math.min(cropRegion.top, (metadata.height || 0) - 1))
    const safeWidth = Math.min(cropRegion.width, (metadata.width || 0) - safeLeft)
    const safeHeight = Math.min(cropRegion.height, (metadata.height || 0) - safeTop)
    
    console.log('[ImageProcessor] Safe crop region:', { safeLeft, safeTop, safeWidth, safeHeight })
    
    // Extract the selected region
    pipeline = pipeline.extract({
      left: safeLeft,
      top: safeTop,
      width: safeWidth,
      height: safeHeight,
    })
    
    // Resize to target dimensions maintaining aspect ratio (cover)
    // This ensures the final image has exact target dimensions
    pipeline = pipeline.resize(width, height, {
      fit: 'cover',
      position: 'center',
    })
  } else {
    // No custom crop - use smart crop
    pipeline = pipeline.resize(width, height, {
      fit: 'cover',
      position: 'attention',
    })
  }

  // Output as JPEG
  const processedBuffer = await pipeline.jpeg({ quality: 90 }).toBuffer()

  // Get metadata of processed image
  const metadata = await sharp(processedBuffer).metadata()

  return {
    buffer: processedBuffer.buffer.slice(
      processedBuffer.byteOffset,
      processedBuffer.byteOffset + processedBuffer.byteLength
    ) as ArrayBuffer,
    width: metadata.width || width,
    height: metadata.height || height,
    sizeBytes: processedBuffer.length,
  }
}
