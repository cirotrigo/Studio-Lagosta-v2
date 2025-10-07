import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { duplicateSection } from '@/lib/cms/mutations'

/**
 * POST /api/cms/sections/[id]/duplicate
 * Duplicate a section
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
    const section = await duplicateSection(id)

    return NextResponse.json({ section }, { status: 201 })
  } catch (error) {
    console.error('Error duplicating section:', error)
    return NextResponse.json(
      { error: 'Failed to duplicate section' },
      { status: 500 }
    )
  }
}
