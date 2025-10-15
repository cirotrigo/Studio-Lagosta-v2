import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSectionById } from '@/lib/cms/queries'
import {
  updateSection,
  deleteSection,
} from '@/lib/cms/mutations'
import { z } from 'zod'

const updateSectionSchema = z.object({
  type: z.enum(['HERO', 'BENTO_GRID', 'FAQ', 'AI_STARTER', 'PRICING', 'CTA', 'CUSTOM']).optional(),
  name: z.string().min(1).optional(),
  content: z.record(z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
  cssClasses: z.string().optional(),
})

/**
 * GET /api/cms/sections/[id]
 * Get a section by ID
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
    const section = await getSectionById(id)

    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }

    return NextResponse.json({ section })
  } catch (error) {
    console.error('Error fetching section:', error)
    return NextResponse.json(
      { error: 'Failed to fetch section' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cms/sections/[id]
 * Update a section
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
    const validatedData = updateSectionSchema.parse(body)

    const section = await updateSection(id, validatedData)

    return NextResponse.json({ section })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating section:', error)
    return NextResponse.json(
      { error: 'Failed to update section' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/cms/sections/[id]
 * Delete a section
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
    await deleteSection(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting section:', error)
    return NextResponse.json(
      { error: 'Failed to delete section' },
      { status: 500 }
    )
  }
}
