import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { updateMenuItem, deleteMenuItem } from '@/lib/cms/mutations'
import { z } from 'zod'

const updateMenuItemSchema = z.object({
  label: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  target: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().optional(),
  parentId: z.string().nullable().optional(),
  isVisible: z.boolean().optional(),
})

/**
 * PATCH /api/cms/menu-items/[id]
 * Update a menu item
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
    const validatedData = updateMenuItemSchema.parse(body)

    const item = await updateMenuItem(id, validatedData)

    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to update menu item' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/cms/menu-items/[id]
 * Delete a menu item
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
    await deleteMenuItem(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting menu item:', error)
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    )
  }
}
