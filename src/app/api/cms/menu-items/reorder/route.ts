import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { reorderMenuItems } from '@/lib/cms/mutations'
import { z } from 'zod'

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
      parentId: z.string().nullable().optional(),
    })
  ),
})

/**
 * PATCH /api/cms/menu-items/reorder
 * Reorder menu items
 */
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = reorderSchema.parse(body)

    await reorderMenuItems(validatedData.items as Array<{ id: string; order: number; parentId?: string | null }>)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error reordering menu items:', error)
    return NextResponse.json(
      { error: 'Failed to reorder menu items' },
      { status: 500 }
    )
  }
}
