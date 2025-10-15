import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getMenuById } from '@/lib/cms/queries'
import { updateMenu, deleteMenu } from '@/lib/cms/mutations'
import { z } from 'zod'

const updateMenuSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  location: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

/**
 * GET /api/cms/menus/[id]
 * Get menu with items
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
    const menu = await getMenuById(id)

    if (!menu) {
      return NextResponse.json({ error: 'Menu not found' }, { status: 404 })
    }

    return NextResponse.json({ menu })
  } catch (error) {
    console.error('Error fetching menu:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cms/menus/[id]
 * Update a menu
 */
export async function PATCH(
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
    const validatedData = updateMenuSchema.parse(body)

    const menu = await updateMenu(id, validatedData)

    return NextResponse.json({ menu })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating menu:', error)
    return NextResponse.json(
      { error: 'Failed to update menu' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/cms/menus/[id]
 * Delete a menu
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    await deleteMenu(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting menu:', error)
    return NextResponse.json(
      { error: 'Failed to delete menu' },
      { status: 500 }
    )
  }
}
