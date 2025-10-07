import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAllMedia } from '@/lib/cms/queries'
import { bulkDeleteMedia } from '@/lib/cms/mutations'
import { del } from '@vercel/blob'

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'At least one ID is required'),
})

/**
 * POST /api/cms/media/bulk-delete
 * Bulk delete media files
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = bulkDeleteSchema.parse(body)

    // Get all media files to delete (to get their URLs)
    const allMedia = await getAllMedia()
    const mediaToDelete = allMedia.filter((m) => validatedData.ids.includes(m.id))

    // Delete from Vercel Blob
    const blobDeletions = mediaToDelete.map(async (media) => {
      try {
        await del(media.url)
      } catch (error) {
        console.error(`Error deleting blob for ${media.id}:`, error)
        // Continue with other deletions
      }
    })

    await Promise.allSettled(blobDeletions)

    // Delete from database
    await bulkDeleteMedia(validatedData.ids)

    return NextResponse.json({
      success: true,
      deleted: validatedData.ids.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error bulk deleting media:', error)
    return NextResponse.json(
      { error: 'Failed to delete media' },
      { status: 500 }
    )
  }
}
