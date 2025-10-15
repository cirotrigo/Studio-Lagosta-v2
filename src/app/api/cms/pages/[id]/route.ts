import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getPageById } from '@/lib/cms/queries'
import {
  updatePage,
  deletePage,
} from '@/lib/cms/mutations'
import { z } from 'zod'

const updatePageSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  isHome: z.boolean().optional(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  ogImage: z.string().optional(),
})

/**
 * GET /api/cms/pages/[id]
 * Get a page by ID
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
    const page = await getPageById(id)

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error('Error fetching page:', error)
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cms/pages/[id]
 * Update a page
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
    const validatedData = updatePageSchema.parse(body)

    const page = await updatePage(id, {
      ...validatedData,
      updatedBy: userId,
    })

    return NextResponse.json({ page })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating page:', error)
    return NextResponse.json(
      { error: 'Failed to update page' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/cms/pages/[id]
 * Delete a page
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
    await deletePage(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting page:', error)
    return NextResponse.json(
      { error: 'Failed to delete page' },
      { status: 500 }
    )
  }
}
