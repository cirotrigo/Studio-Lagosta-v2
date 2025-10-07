import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import {
  getAllMedia,
  getMediaByFolder,
  getMediaByMimeType,
  searchMedia,
} from '@/lib/cms/queries'

/**
 * GET /api/cms/media
 * Get all media files with optional filters
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const folder = searchParams.get('folder')
    const type = searchParams.get('type')
    const q = searchParams.get('q')

    let media

    if (q) {
      // Search query
      media = await searchMedia(q)
    } else if (type) {
      // Filter by type
      media = await getMediaByMimeType(type)
    } else if (folder) {
      // Filter by folder
      media = await getMediaByFolder(folder)
    } else {
      // Get all
      media = await getAllMedia()
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
