import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getComponentBySlug } from '@/lib/cms/queries'
import { updateComponent, deleteComponent } from '@/lib/cms/mutations'

const updateComponentSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  content: z.any().optional(),
  thumbnail: z.string().optional(),
  isGlobal: z.boolean().optional(),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * GET /api/cms/components/[id]
 * Get a single component
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const component = await getComponentBySlug(id)

    if (!component) {
      return NextResponse.json({ error: 'Component not found' }, { status: 404 })
    }

    return NextResponse.json({ component })
  } catch (error) {
    console.error('Error fetching component:', error)
    return NextResponse.json(
      { error: 'Failed to fetch component' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cms/components/[id]
 * Update a component
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()
    const validatedData = updateComponentSchema.parse(body)

    const component = await updateComponent(id, validatedData)

    return NextResponse.json({ component })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating component:', error)
    return NextResponse.json(
      { error: 'Failed to update component' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/cms/components/[id]
 * Delete a component
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    await deleteComponent(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting component:', error)
    return NextResponse.json(
      { error: 'Failed to delete component' },
      { status: 500 }
    )
  }
}
