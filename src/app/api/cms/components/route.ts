import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAllComponents, getComponentsByType } from '@/lib/cms/queries'
import { createComponent } from '@/lib/cms/mutations'
import { getUserFromClerkId } from '@/lib/auth-utils'

const createComponentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  description: z.string().optional(),
  type: z.string().min(1, 'Type is required'),
  content: z.any(),
  thumbnail: z.string().optional(),
  isGlobal: z.boolean().default(false),
})

/**
 * GET /api/cms/components
 * Get all components with optional filters
 */
export async function GET(request: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    let components

    if (type) {
      components = await getComponentsByType(type)
    } else {
      components = await getAllComponents()
    }

    return NextResponse.json({ components })
  } catch (error) {
    console.error('Error fetching components:', error)
    return NextResponse.json(
      { error: 'Failed to fetch components' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cms/components
 * Create a new component
 */
export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkId)
    const body = await request.json()
    const validatedData = createComponentSchema.parse(body)

    const component = await createComponent({
      name: validatedData.name,
      slug: validatedData.slug,
      description: validatedData.description,
      type: validatedData.type,
      content: validatedData.content,
      thumbnail: validatedData.thumbnail,
      isGlobal: validatedData.isGlobal,
      createdBy: user.id,
    })

    return NextResponse.json({ component }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating component:', error)
    return NextResponse.json(
      { error: 'Failed to create component' },
      { status: 500 }
    )
  }
}
