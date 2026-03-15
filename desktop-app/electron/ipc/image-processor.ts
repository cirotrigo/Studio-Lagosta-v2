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

  // Get original image metadata first
  const originalMetadata = await sharp(inputBuffer).metadata()
  const originalWidth = originalMetadata.width || 0
  const originalHeight = originalMetadata.height || 0

  console.log('[ImageProcessor] Processing image:', {
    postType,
    targetDimensions: dimensions,
    originalDimensions: { width: originalWidth, height: originalHeight },
    cropRegion,
    inputBufferSize: inputBuffer.length
  })

  let pipeline = sharp(inputBuffer)

  // If custom crop region provided, extract and resize to target
  if (cropRegion) {
    console.log('[ImageProcessor] Applying custom crop:', cropRegion)

    // Ensure crop region is within bounds
    const safeLeft = Math.max(0, Math.min(cropRegion.left, originalWidth - 1))
    const safeTop = Math.max(0, Math.min(cropRegion.top, originalHeight - 1))
    const safeWidth = Math.min(cropRegion.width, originalWidth - safeLeft)
    const safeHeight = Math.min(cropRegion.height, originalHeight - safeTop)

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
    // Check if image already has the exact target dimensions
    const isExactMatch = originalWidth === width && originalHeight === height

    // Check if image has the same aspect ratio (within tolerance)
    const originalAspect = originalWidth / originalHeight
    const targetAspect = width / height
    const aspectTolerance = 0.001 // 0.1% tolerance
    const isSameAspectRatio = Math.abs(originalAspect - targetAspect) < aspectTolerance

    console.log('[ImageProcessor] Dimension check:', {
      isExactMatch,
      isSameAspectRatio,
      originalAspect: originalAspect.toFixed(4),
      targetAspect: targetAspect.toFixed(4)
    })

    if (isExactMatch) {
      // Image already has exact dimensions - no resize needed
      console.log('[ImageProcessor] Image already at target dimensions, skipping resize')
    } else if (isSameAspectRatio) {
      // Same aspect ratio - just resize without cropping
      console.log('[ImageProcessor] Same aspect ratio, resizing without crop')
      pipeline = pipeline.resize(width, height, {
        fit: 'fill', // Fill exact dimensions since aspect ratio matches
      })
    } else {
      // Different aspect ratio - use smart crop
      console.log('[ImageProcessor] Different aspect ratio, using smart crop')
      pipeline = pipeline.resize(width, height, {
        fit: 'cover',
        position: 'attention',
      })
    }
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
