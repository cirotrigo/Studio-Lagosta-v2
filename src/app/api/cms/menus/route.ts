import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getAllMenus } from '@/lib/cms/queries'
import { createMenu } from '@/lib/cms/mutations'
import { z } from 'zod'

const createMenuSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  location: z.string().min(1, 'Location is required'),
  isActive: z.boolean().default(true),
})

/**
 * GET /api/cms/menus
 * Get all menus
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const menus = await getAllMenus()
    return NextResponse.json({ menus })
  } catch (error) {
    console.error('Error fetching menus:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menus' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cms/menus
 * Create a new menu
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createMenuSchema.parse(body)

    const menu = await createMenu({
      name: validatedData.name,
      slug: validatedData.slug,
      location: validatedData.location,
      isActive: validatedData.isActive,
    })

    return NextResponse.json({ menu }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating menu:', error)
    return NextResponse.json(
      { error: 'Failed to create menu' },
      { status: 500 }
    )
  }
}
