import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

// Helper to derive format from dimensions
function getFormatFromDimensions(width: number, height: number): string {
  const ratio = width / height
  if (ratio === 1) return 'SQUARE'
  if (ratio < 0.7) return 'STORY' // 9:16 = 0.5625
  return 'FEED_PORTRAIT' // 4:5 = 0.8
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Parse query params
  const url = new URL(req.url)
  const tagsParam = url.searchParams.get('tags')
  const format = url.searchParams.get('format')
  const search = url.searchParams.get('search')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
  const offset = Number(url.searchParams.get('offset')) || 0

  const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : []

  // Build where clause for pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    Template: {
      projectId: projectIdNum,
    },
  }

  // Filter by tags (OR - page has any of the selected tags)
  if (tags.length > 0) {
    whereClause.tags = {
      hasSome: tags,
    }
  }

  // Filter by search (page name)
  if (search) {
    whereClause.name = {
      contains: search,
      mode: 'insensitive',
    }
  }

  // Get all pages matching filters
  const [pages, total] = await Promise.all([
    db.page.findMany({
      where: whereClause,
      include: {
        Template: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: [
        { updatedAt: 'desc' },
      ],
      skip: offset,
      take: limit,
    }),
    db.page.count({ where: whereClause }),
  ])

  // Filter by format (needs to be done post-query since it's derived from dimensions)
  let filteredPages = pages
  if (format) {
    filteredPages = pages.filter((page) => {
      const pageFormat = getFormatFromDimensions(page.width, page.height)
      return pageFormat === format
    })
  }

  // Transform response
  const designs = filteredPages.map((page) => ({
    id: page.id,
    name: page.name,
    thumbnail: page.thumbnail,
    width: page.width,
    height: page.height,
    format: getFormatFromDimensions(page.width, page.height),
    tags: page.tags,
    templateId: page.templateId,
    templateName: page.Template.name,
    updatedAt: page.updatedAt.toISOString(),
  }))

  return NextResponse.json({
    designs,
    total: format ? filteredPages.length : total,
    hasMore: offset + designs.length < (format ? filteredPages.length : total),
  })
}
