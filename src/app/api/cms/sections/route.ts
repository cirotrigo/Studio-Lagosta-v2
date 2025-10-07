import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getPageSections } from '@/lib/cms/queries'
import { createSection, reorderSections } from '@/lib/cms/mutations'
import { z } from 'zod'

const createSectionSchema = z.object({
  pageId: z.string().min(1, 'Page ID is required'),
  type: z.enum(['HERO', 'BENTO_GRID', 'FAQ', 'AI_STARTER', 'PRICING', 'CTA', 'CUSTOM']),
  name: z.string().min(1, 'Name is required'),
  content: z.record(z.unknown()),
  order: z.number().int().min(0).optional(),
  isVisible: z.boolean().default(true),
  cssClasses: z.string().optional(),
})

const reorderSectionsSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
    })
  ),
})

/**
 * GET /api/cms/sections?pageId=xxx
 * Get all sections for a page
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const pageId = searchParams.get('pageId')

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      )
    }

    const sections = await getPageSections(pageId)
    return NextResponse.json({ sections })
  } catch (error) {
    console.error('Error fetching sections:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sections' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cms/sections
 * Create a new section
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createSectionSchema.parse(body)

    const section = await createSection(validatedData)

    return NextResponse.json({ section }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating section:', error)
    return NextResponse.json(
      { error: 'Failed to create section' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cms/sections
 * Reorder sections
 */
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = reorderSectionsSchema.parse(body)

    await reorderSections(validatedData.sections)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error reordering sections:', error)
    return NextResponse.json(
      { error: 'Failed to reorder sections' },
      { status: 500 }
    )
  }
}
