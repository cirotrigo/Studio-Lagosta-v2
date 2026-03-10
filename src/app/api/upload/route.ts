import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { cropToInstagramFeed, getImageInfo } from '@/lib/images/auto-crop'

export const runtime = 'nodejs'
export const maxDuration = 60 // Maximum execution time in seconds

// Magic bytes validation for image security
const IMAGE_SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // "RIFF"
  'image/gif': [0x47, 0x49, 0x46],
}

const DESIGN_SYSTEM_MIME_TYPES = new Set([
  'text/html',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream', // fallback comum para zip em alguns sistemas
])

function isDesignSystemFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) return true
  if (lowerName.endsWith('.zip')) return true
  return DESIGN_SYSTEM_MIME_TYPES.has(file.type)
}

function inferDesignSystemContentType(file: File): string {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) return 'text/html'
  if (lowerName.endsWith('.zip')) return 'application/zip'
  return file.type || 'application/octet-stream'
}

function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signature = IMAGE_SIGNATURES[mimeType]
  if (!signature) {
    // Unknown type, allow it (backward compatibility)
    return true
  }

  // Check if buffer starts with expected signature
  const matches = signature.every((byte, i) => buffer[i] === byte)

  // For WebP, also check "WEBP" at offset 8
  if (mimeType === 'image/webp' && matches) {
    const webpMarker = buffer.slice(8, 12).toString('ascii')
    return webpMarker === 'WEBP'
  }

  return matches
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    console.warn('[Upload] Unauthorized upload attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Upload] Starting file upload for user:', userId)

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const uploadType = formData.get('type') as string | null // 'reference' or 'post'

    if (!file) {
      console.warn('[Upload] No file provided in request')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('[Upload] File details:', {
      name: file.name,
      type: file.type,
      size: file.size,
      uploadType,
    })

    const isDesignSystemUpload = uploadType === 'design_system'

    // Validate file type (images, videos, and design system package)
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isDesignSystem = isDesignSystemFile(file)

    if (isDesignSystemUpload && !isDesignSystem) {
      return NextResponse.json(
        { error: 'Design System deve ser HTML ou ZIP' },
        { status: 400 }
      )
    }

    if (!isDesignSystemUpload && !isImage && !isVideo) {
      return NextResponse.json(
        { error: 'Only images and videos are allowed' },
        { status: 400 }
      )
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large (max 100MB)' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    let buffer: Buffer = Buffer.from(arrayBuffer)

    // Validate magic bytes (file signatures) for security
    if (isImage) {
      const magicBytes = buffer.slice(0, 12)
      const isValidImage = validateImageMagicBytes(magicBytes, file.type)

      if (!isValidImage) {
        console.warn('[Upload] Invalid image file (magic bytes mismatch):', {
          fileName: file.name,
          declaredType: file.type,
          firstBytes: Array.from(magicBytes.slice(0, 4)).map(b => b.toString(16)).join(' ')
        })
        return NextResponse.json(
          { error: 'File is not a valid image' },
          { status: 400 }
        )
      }
    }

    // Auto-crop only raw "post" uploads to Instagram feed format (4:5 - 1080x1350)
    // Keep reference/approved renders untouched to preserve original format (Story/Square/etc)
    const shouldCrop = isImage && uploadType === 'post'
    if (shouldCrop) {
      try {
        const imageInfo = await getImageInfo(buffer)
        console.log(`📷 Original image: ${imageInfo.width}x${imageInfo.height} (ratio: ${imageInfo.ratio.toFixed(2)})`)

        // Crop to 4:5 ratio for feed posts
        const croppedBuffer = await cropToInstagramFeed(buffer)
        buffer = croppedBuffer
        console.log('✂️ Image cropped to 1080x1350 (4:5 ratio)')
      } catch (cropError) {
        console.error('Crop error:', cropError)
        // Continue with original buffer if crop fails
        console.warn('⚠️ Using original image (crop failed)')
      }
    } else if (uploadType === 'reference' || uploadType === 'approved_art') {
      console.log('📷 Skipping crop for non-post image type:', uploadType)
    }

    // Check if Vercel Blob token is configured
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (!blobToken || blobToken.trim() === '') {
      console.error('[Upload] BLOB_READ_WRITE_TOKEN not configured')
      return NextResponse.json(
        { error: 'Upload service not configured' },
        { status: 503 }
      )
    }

    // Upload to Vercel Blob
    const extension = isDesignSystemUpload
      ? file.name.split('.').pop() || 'zip'
      : uploadType === 'reference'
        ? file.name.split('.').pop() || 'jpg'
        : 'jpg'
    const fileName = file.name.replace(/\.[^/.]+$/, `.${extension}`)
    const folder =
      uploadType === 'reference'
        ? 'references'
        : uploadType === 'approved_art'
          ? 'approved-arts'
          : uploadType === 'design_system'
            ? 'design-systems'
          : 'posts'
    console.log('[Upload] Uploading to Vercel Blob...')

    const blob = await put(
      `${folder}/${userId}/${Date.now()}-${fileName}`,
      buffer,
      {
        access: 'public',
        addRandomSuffix: true,
        contentType: isDesignSystemUpload
          ? inferDesignSystemContentType(file)
          : isImage && uploadType !== 'reference'
            ? 'image/jpeg'
            : file.type,
      }
    )

    console.log('[Upload] Upload successful:', blob.url)

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
    })
  } catch (error) {
    console.error('[Upload] Error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file'
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}
