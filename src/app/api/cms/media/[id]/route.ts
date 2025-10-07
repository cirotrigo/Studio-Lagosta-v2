import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getMediaById } from '@/lib/cms/queries'
import { updateMedia, deleteMedia } from '@/lib/cms/mutations'
import { del } from '@vercel/blob'

const updateMediaSchema = z.object({
  name: z.string().min(1).optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  folder: z.string().optional(),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * GET /api/cms/media/[id]
 * Get a single media file
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const media = await getMediaById(id)

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    return NextResponse.json({ media })
  } catch (error) {
    console.error('Error fetching media:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cms/media/[id]
 * Update media metadata
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()
    const validatedData = updateMediaSchema.parse(body)

    const media = await updateMedia(id, validatedData)

    return NextResponse.json({ media })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating media:', error)
    return NextResponse.json(
      { error: 'Failed to update media' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/cms/media/[id]
 * Delete a media file
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const media = await getMediaById(id)

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Delete from Vercel Blob
    try {
      await del(media.url)
    } catch (blobError) {
      console.error('Error deleting from Vercel Blob:', blobError)
      // Continue with database deletion even if blob deletion fails
    }

    // Delete from database
    await deleteMedia(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting media:', error)
    return NextResponse.json(
      { error: 'Failed to delete media' },
      { status: 500 }
    )
  }
}
