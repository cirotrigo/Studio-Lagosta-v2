import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createMenuItem } from '@/lib/cms/mutations'
import { z } from 'zod'

const createMenuItemSchema = z.object({
  menuId: z.string().min(1),
  label: z.string().min(1, 'Label is required'),
  url: z.string().min(1, 'URL is required'),
  target: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().optional(),
  parentId: z.string().optional(),
  isVisible: z.boolean().default(true),
})

/**
 * POST /api/cms/menu-items
 * Create a new menu item
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createMenuItemSchema.parse(body)

    const item = await createMenuItem({
      menuId: validatedData.menuId,
      label: validatedData.label,
      url: validatedData.url,
      target: validatedData.target,
      icon: validatedData.icon,
      order: validatedData.order,
      parentId: validatedData.parentId,
      isVisible: validatedData.isVisible,
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating menu item:', error)
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    )
  }
}
