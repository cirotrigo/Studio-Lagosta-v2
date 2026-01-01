/**
 * Get Story Analytics Report for a Project
 * Returns analytics for all Stories with insights data
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await params

    // Verify project ownership
    const project = await db.project.findFirst({
      where: {
        id: parseInt(projectId),
        userId,
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get query parameters for filtering
    const searchParams = req.nextUrl.searchParams
    const daysAgo = parseInt(searchParams.get('days') || '30')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysAgo)

    // Fetch Stories with analytics
    const stories = await db.socialPost.findMany({
      where: {
        projectId: project.id,
        postType: 'STORY',
        status: 'POSTED',
        analyticsReach: {
          not: null, // Only Stories with analytics
        },
        sentAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        caption: true,
        sentAt: true,
        verifiedStoryId: true,
        publishedUrl: true,
        analyticsImpressions: true,
        analyticsReach: true,
        analyticsComments: true,
        analyticsEngagement: true,
        analyticsFetchedAt: true,
      },
      orderBy: {
        sentAt: 'desc',
      },
    })

    // Calculate summary statistics
    const totalStories = stories.length
    const totalImpressions = stories.reduce(
      (sum, s) => sum + (s.analyticsImpressions || 0),
      0
    )
    const totalReach = stories.reduce(
      (sum, s) => sum + (s.analyticsReach || 0),
      0
    )
    const totalReplies = stories.reduce(
      (sum, s) => sum + (s.analyticsComments || 0),
      0
    )
    const totalEngagement = stories.reduce(
      (sum, s) => sum + (s.analyticsEngagement || 0),
      0
    )

    const avgImpressions = totalStories > 0 ? totalImpressions / totalStories : 0
    const avgReach = totalStories > 0 ? totalReach / totalStories : 0
    const avgReplies = totalStories > 0 ? totalReplies / totalStories : 0
    const avgEngagementRate =
      totalReach > 0 ? (totalEngagement / totalReach) * 100 : 0

    // Find best performing story
    const bestStory = stories.reduce(
      (best, current) => {
        const currentReach = current.analyticsReach || 0
        const bestReach = best.analyticsReach || 0
        return currentReach > bestReach ? current : best
      },
      stories[0] || null
    )

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
      },
      period: {
        days: daysAgo,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      summary: {
        totalStories,
        totalImpressions,
        totalReach,
        totalReplies,
        totalEngagement,
        averages: {
          impressions: Math.round(avgImpressions),
          reach: Math.round(avgReach),
          replies: Math.round(avgReplies * 10) / 10,
          engagementRate: Math.round(avgEngagementRate * 100) / 100,
        },
        bestStory: bestStory
          ? {
              id: bestStory.id,
              caption: bestStory.caption?.substring(0, 100),
              impressions: bestStory.analyticsImpressions,
              reach: bestStory.analyticsReach,
              replies: bestStory.analyticsComments,
              sentAt: bestStory.sentAt,
            }
          : null,
      },
      stories: stories.map((s) => ({
        id: s.id,
        caption: s.caption?.substring(0, 100),
        sentAt: s.sentAt,
        analytics: {
          impressions: s.analyticsImpressions,
          reach: s.analyticsReach,
          replies: s.analyticsComments,
          engagement: s.analyticsEngagement,
          engagementRate:
            s.analyticsReach && s.analyticsReach > 0
              ? Math.round(
                  ((s.analyticsEngagement || 0) / s.analyticsReach) * 10000
                ) / 100
              : 0,
        },
        fetchedAt: s.analyticsFetchedAt,
        url: s.publishedUrl,
      })),
    })
  } catch (error) {
    console.error('[Stories Report API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
