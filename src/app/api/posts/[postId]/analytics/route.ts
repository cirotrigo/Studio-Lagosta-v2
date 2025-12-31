/**
 * Post Analytics API
 * GET: Returns analytics from database
 * POST: Force refresh analytics from Later API
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getLaterClient } from '@/lib/later/client'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/posts/[postId]/analytics
 * Returns cached analytics data from database
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId: id } = await params

    // Fetch post with analytics
    const post = await db.socialPost.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        laterPostId: true,
        analyticsLikes: true,
        analyticsComments: true,
        analyticsShares: true,
        analyticsReach: true,
        analyticsImpressions: true,
        analyticsEngagement: true,
        analyticsFetchedAt: true,
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Verify ownership
    if (post.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      postId: post.id,
      laterPostId: post.laterPostId,
      analyticsLikes: post.analyticsLikes,
      analyticsComments: post.analyticsComments,
      analyticsShares: post.analyticsShares,
      analyticsReach: post.analyticsReach,
      analyticsImpressions: post.analyticsImpressions,
      analyticsEngagement: post.analyticsEngagement,
      analyticsFetchedAt: post.analyticsFetchedAt,
    })
  } catch (error) {
    console.error('[Post Analytics API] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/posts/[postId]/analytics
 * Force refresh analytics from Later API
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId: id } = await params

    // Fetch post
    const post = await db.socialPost.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        laterPostId: true,
        status: true,
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Verify ownership
    if (post.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate post has laterPostId
    if (!post.laterPostId) {
      return NextResponse.json(
        { error: 'Post does not have Later integration' },
        { status: 400 }
      )
    }

    // Validate post is published
    if (post.status !== 'POSTED') {
      return NextResponse.json(
        { error: 'Post is not published yet' },
        { status: 400 }
      )
    }

    console.log(
      `[Post Analytics API] Force refresh for post ${id} (Later: ${post.laterPostId})`
    )

    // Fetch analytics from Later API
    const laterClient = getLaterClient()
    const analytics = await laterClient.getPostAnalytics(post.laterPostId)

    // Update post with analytics data
    const updatedPost = await db.socialPost.update({
      where: { id },
      data: {
        analyticsLikes: analytics.metrics.likes,
        analyticsComments: analytics.metrics.comments,
        analyticsShares: analytics.metrics.shares || null,
        analyticsReach: analytics.metrics.reach || null,
        analyticsImpressions: analytics.metrics.impressions || null,
        analyticsEngagement: analytics.metrics.engagement,
        analyticsFetchedAt: new Date(),
      },
      select: {
        id: true,
        laterPostId: true,
        analyticsLikes: true,
        analyticsComments: true,
        analyticsShares: true,
        analyticsReach: true,
        analyticsImpressions: true,
        analyticsEngagement: true,
        analyticsFetchedAt: true,
      },
    })

    console.log(
      `[Post Analytics API] ✅ Refreshed analytics for post ${id}:`,
      {
        likes: analytics.metrics.likes,
        comments: analytics.metrics.comments,
        engagement: analytics.metrics.engagement,
      }
    )

    return NextResponse.json({
      postId: updatedPost.id,
      laterPostId: updatedPost.laterPostId,
      analyticsLikes: updatedPost.analyticsLikes,
      analyticsComments: updatedPost.analyticsComments,
      analyticsShares: updatedPost.analyticsShares,
      analyticsReach: updatedPost.analyticsReach,
      analyticsImpressions: updatedPost.analyticsImpressions,
      analyticsEngagement: updatedPost.analyticsEngagement,
      analyticsFetchedAt: updatedPost.analyticsFetchedAt,
    })
  } catch (error) {
    console.error('[Post Analytics API] POST error:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { error: 'Failed to refresh analytics' },
      { status: 500 }
    )
  }
}
