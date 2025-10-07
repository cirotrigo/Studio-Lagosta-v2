import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getAllPages, getPagesByStatus } from '@/lib/cms/queries'
import { createPage } from '@/lib/cms/mutations'
import { z } from 'zod'

const createPageSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  path: z.string().min(1, 'Path is required'),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  isHome: z.boolean().default(false),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  ogImage: z.string().optional(),
})

/**
 * GET /api/cms/pages
 * Get all pages or filter by status
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let pages
    if (status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      pages = await getPagesByStatus(status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED')
    } else {
      pages = await getAllPages()
    }

    return NextResponse.json({ pages })
  } catch (error) {
    console.error('Error fetching pages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pages' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cms/pages
 * Create a new page
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createPageSchema.parse(body)

    const page = await createPage({
      ...validatedData,
      createdBy: userId,
    })

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating page:', error)
    return NextResponse.json(
      { error: 'Failed to create page' },
      { status: 500 }
    )
  }
}
