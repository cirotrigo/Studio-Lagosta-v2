import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

const DIMENSIONS: Record<string, { width: number; height: number }> = {
  POST: { width: 1080, height: 1350 },
  CAROUSEL: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
  REEL: { width: 1080, height: 1920 },
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const postType = formData.get('postType') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!postType || !DIMENSIONS[postType]) {
      return NextResponse.json(
        { error: 'Invalid postType. Must be POST, STORY, REEL, or CAROUSEL' },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Accepted: JPEG, PNG, WebP' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum: 20MB' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { width, height } = DIMENSIONS[postType]

    const processedBuffer = await sharp(buffer)
      .resize(width, height, {
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: 90 })
      .toBuffer()

    return new NextResponse(new Uint8Array(processedBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="processed_${Date.now()}.jpg"`,
        'X-Processed-Width': String(width),
        'X-Processed-Height': String(height),
        'X-Processed-Size': String(processedBuffer.length),
      },
    })
  } catch (error) {
    console.error('[API] POST /api/tools/process-image error:', error)
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    )
  }
}
