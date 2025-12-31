/**
 * Project Analytics API
 * Returns aggregated analytics data for a project
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/projects/[projectId]/analytics
 * Returns aggregated analytics for all posts in a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId: id } = await params
    const projectId = parseInt(id, 10)

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    // Verify project access (handles both user and organization ownership)
    const project = await fetchProjectWithShares(projectId)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const sortBy = (searchParams.get('sortBy') || 'sentAt') as
      | 'sentAt'
      | 'engagement'
      | 'reach'
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc'

    // Build where clause
    const where: any = {
      projectId,
      status: 'POSTED',
      laterPostId: { not: null },
    }

    if (fromDate || toDate) {
      where.sentAt = {}
      if (fromDate) where.sentAt.gte = new Date(fromDate)
      if (toDate) where.sentAt.lte = new Date(toDate)
    }

    // Fetch posts with analytics
    const posts = await db.socialPost.findMany({
      where,
      select: {
        id: true,
        postType: true,
        caption: true,
        sentAt: true,
        publishedUrl: true,
        laterPostId: true,
        analyticsLikes: true,
        analyticsComments: true,
        analyticsShares: true,
        analyticsReach: true,
        analyticsImpressions: true,
        analyticsEngagement: true,
        analyticsFetchedAt: true,
      },
      orderBy:
        sortBy === 'engagement'
          ? { analyticsEngagement: order }
          : sortBy === 'reach'
          ? { analyticsReach: order }
          : { sentAt: order },
      take: limit,
    })

    // Calculate summary statistics
    const postsWithAnalytics = posts.filter((p) => p.analyticsEngagement !== null)

    const summary = {
      totalPosts: posts.length,
      totalLikes: postsWithAnalytics.reduce(
        (sum, p) => sum + (p.analyticsLikes || 0),
        0
      ),
      totalComments: postsWithAnalytics.reduce(
        (sum, p) => sum + (p.analyticsComments || 0),
        0
      ),
      totalShares: postsWithAnalytics.reduce(
        (sum, p) => sum + (p.analyticsShares || 0),
        0
      ),
      totalReach: postsWithAnalytics.reduce(
        (sum, p) => sum + (p.analyticsReach || 0),
        0
      ),
      totalImpressions: postsWithAnalytics.reduce(
        (sum, p) => sum + (p.analyticsImpressions || 0),
        0
      ),
      totalEngagement: postsWithAnalytics.reduce(
        (sum, p) => sum + (p.analyticsEngagement || 0),
        0
      ),
      avgEngagementRate:
        postsWithAnalytics.length > 0
          ? postsWithAnalytics.reduce((sum, p) => {
              const reach = p.analyticsReach || 1
              const engagement = p.analyticsEngagement || 0
              return sum + (engagement / reach) * 100
            }, 0) / postsWithAnalytics.length
          : 0,
      postsWithAnalytics: postsWithAnalytics.length,
    }

    // Get top performers
    const topByEngagement = [...posts]
      .filter((p) => p.analyticsEngagement !== null)
      .sort((a, b) => (b.analyticsEngagement || 0) - (a.analyticsEngagement || 0))
      .slice(0, 5)

    const topByReach = [...posts]
      .filter((p) => p.analyticsReach !== null)
      .sort((a, b) => (b.analyticsReach || 0) - (a.analyticsReach || 0))
      .slice(0, 5)

    return NextResponse.json({
      summary,
      posts,
      topPerformers: {
        byEngagement: topByEngagement,
        byReach: topByReach,
      },
    })
  } catch (error) {
    console.error('[Project Analytics API] Error:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
