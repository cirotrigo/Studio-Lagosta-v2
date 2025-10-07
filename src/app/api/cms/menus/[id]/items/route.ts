import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getMenuItems } from '@/lib/cms/queries'

/**
 * GET /api/cms/menus/[id]/items
 * Get all items for a menu
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const items = await getMenuItems(id)

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    )
  }
}
