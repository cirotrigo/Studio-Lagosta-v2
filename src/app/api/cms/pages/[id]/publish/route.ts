import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { publishPage, unpublishPage } from '@/lib/cms/mutations'

/**
 * POST /api/cms/pages/[id]/publish
 * Publish or unpublish a page
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { publish } = body

    const page = publish
      ? await publishPage(id, userId)
      : await unpublishPage(id, userId)

    return NextResponse.json({ page })
  } catch (error) {
    console.error('Error toggling page publish status:', error)
    return NextResponse.json(
      { error: 'Failed to update page status' },
      { status: 500 }
    )
  }
}
