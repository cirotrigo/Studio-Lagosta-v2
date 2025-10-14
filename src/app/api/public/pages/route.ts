import { NextResponse } from 'next/server'
import { getHomePage, getPageByPath } from '@/lib/cms/queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/pages?path=/
 * Get a published page by path (public access)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json(
        { error: 'Path parameter is required' },
        { status: 400 }
      )
    }

    // Get page by path
    const page = path === '/'
      ? await getHomePage()
      : await getPageByPath(path)

    if (!page || page.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error('Error fetching public page:', error)
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    )
  }
}
