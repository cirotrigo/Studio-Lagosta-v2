import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { toggleSectionVisibility } from '@/lib/cms/mutations'

/**
 * POST /api/cms/sections/[id]/toggle-visibility
 * Toggle section visibility
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
    const section = await toggleSectionVisibility(id)

    return NextResponse.json({ section })
  } catch (error) {
    console.error('Error toggling section visibility:', error)
    return NextResponse.json(
      { error: 'Failed to toggle section visibility' },
      { status: 500 }
    )
  }
}
