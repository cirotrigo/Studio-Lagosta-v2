import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { createMedia } from '@/lib/cms/mutations'
import { getUserFromClerkId } from '@/lib/auth-utils'

/**
 * POST /api/cms/media/upload
 * Upload a new media file
 */
export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkId)

    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string | null
    const alt = formData.get('alt') as string | null
    const caption = formData.get('caption') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    // Upload to Vercel Blob
    const blob = await put(file.name, file, {
      access: 'public',
      addRandomSuffix: true,
    })

    // Get image dimensions if it's an image
    const width: number | null = null
    const height: number | null = null

    if (file.type.startsWith('image/')) {
      // For images, we can try to get dimensions from the file
      // This is a simplified approach - in production you might want to use sharp or similar
      const buffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)

      // Try to extract dimensions (this is a basic example)
      // In production, use a proper image processing library
      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        // Basic JPEG dimension extraction would go here
        // For now, we'll set them as null and let the frontend handle it
      }
    }

    // Create media record in database
    const media = await createMedia({
      name: file.name.split('.')[0] || 'Untitled',
      filename: blob.pathname.split('/').pop() || file.name,
      url: blob.url,
      thumbnailUrl: blob.url, // For now, use the same URL
      mimeType: file.type,
      size: file.size,
      width,
      height,
      alt: alt || null,
      caption: caption || null,
      folder: folder || null,
      uploadedBy: user.id,
    })

    return NextResponse.json({ media }, { status: 201 })
  } catch (error) {
    console.error('Error uploading media:', error)
    return NextResponse.json(
      { error: 'Failed to upload media' },
      { status: 500 }
    )
  }
}
