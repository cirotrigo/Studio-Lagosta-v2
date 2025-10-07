import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { duplicatePage } from '@/lib/cms/mutations'

/**
 * POST /api/cms/pages/[id]/duplicate
 * Duplicate a page
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
    const page = await duplicatePage(id, userId)

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    console.error('Error duplicating page:', error)
    return NextResponse.json(
      { error: 'Failed to duplicate page' },
      { status: 500 }
    )
  }
}
