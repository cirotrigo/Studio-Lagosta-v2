import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { cropToInstagramFeed, getImageInfo } from '@/lib/images/auto-crop'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type (images and videos)
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: 'Only images and videos are allowed' },
        { status: 400 }
      )
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large (max 50MB)' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    let buffer = Buffer.from(arrayBuffer)

    // Auto-crop images to Instagram feed format (4:5 - 1080x1350)
    if (isImage) {
      try {
        const imageInfo = await getImageInfo(buffer)
        console.log(`📷 Original image: ${imageInfo.width}x${imageInfo.height} (ratio: ${imageInfo.ratio.toFixed(2)})`)

        // Crop to 4:5 ratio for feed posts
        buffer = await cropToInstagramFeed(buffer)
        console.log('✂️ Image cropped to 1080x1350 (4:5 ratio)')
      } catch (cropError) {
        console.error('Crop error:', cropError)
        // Continue with original buffer if crop fails
        console.warn('⚠️ Using original image (crop failed)')
      }
    }

    // Upload to Vercel Blob
    const fileName = file.name.replace(/\.[^/.]+$/, '.jpg') // Ensure .jpg extension after crop
    const blob = await put(
      `posts/${userId}/${Date.now()}-${fileName}`,
      buffer,
      {
        access: 'public',
        addRandomSuffix: true,
        contentType: isImage ? 'image/jpeg' : file.type,
      }
    )

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
