/**
 * Calendar Analytics API
 * Get analytics for posts in calendar view
 * Returns posts with metrics for a specific month/project
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectReadAccess } from '@/lib/projects/access'

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = parseInt(searchParams.get('projectId') || '0', 10)
    const month = searchParams.get('month') // '2025-01'

    if (!projectId || !month) {
      return NextResponse.json(
        { error: 'projectId and month required' },
        { status: 400 }
      )
    }

    // Verify project access
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: { clerkOrgId: true, name: true }
            }
          }
        }
      }
    })

    if (!project || !hasProjectReadAccess(project, { userId: clerkUserId, orgId })) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse month (format: YYYY-MM)
    const [year, monthNum] = month.split('-').map(Number)
    const startDate = new Date(year, monthNum - 1, 1)
    const endDate = new Date(year, monthNum, 0, 23, 59, 59)

    // Fetch posts with analytics
    const posts = await db.socialPost.findMany({
      where: {
        projectId,
        status: 'POSTED',
        latePublishedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        caption: true,
        postType: true,
        latePublishedAt: true,
        latePlatformUrl: true,
        mediaUrls: true,

        // Analytics
        analyticsLikes: true,
        analyticsComments: true,
        analyticsShares: true,
        analyticsReach: true,
        analyticsImpressions: true,
        analyticsEngagement: true,
        analyticsFetchedAt: true
      },
      orderBy: { latePublishedAt: 'desc' }
    })

    // Calculate overview stats
    const overview = {
      totalPosts: posts.length,
      totalLikes: posts.reduce((sum, p) => sum + (p.analyticsLikes || 0), 0),
      totalComments: posts.reduce((sum, p) => sum + (p.analyticsComments || 0), 0),
      totalEngagement: posts.reduce((sum, p) => sum + (p.analyticsEngagement || 0), 0),
      avgEngagement: posts.length > 0
        ? Math.round(posts.reduce((sum, p) => sum + (p.analyticsEngagement || 0), 0) / posts.length)
        : 0,
      hasAnalytics: posts.some(p => p.analyticsFetchedAt !== null)
    }

    return NextResponse.json({
      posts,
      overview,
      month
    })

  } catch (error) {
    console.error('Error fetching calendar analytics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
