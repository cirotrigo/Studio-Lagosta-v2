/**
 * Cron Job: Fetch Later Analytics
 * Runs every 6 hours to fetch analytics from Later API
 * for posts with status POSTED and laterPostId not null
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLaterClient } from '@/lib/later/client'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max

/**
 * Cron job to fetch analytics from Later API
 * Schedule: Every 6 hours
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[Later Analytics Cron] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Later Analytics Cron] Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Later Analytics Cron] Starting analytics fetch...')

    // Find posts with laterPostId that need analytics update
    // Fetch analytics for:
    // 1. Posts with status POSTED
    // 2. Posts with laterPostId (published via Later)
    // 3. Posts without analytics OR analytics older than 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    const postsToFetch = await db.socialPost.findMany({
      where: {
        status: 'POSTED',
        laterPostId: {
          not: null,
        },
        OR: [
          { analyticsFetchedAt: null }, // Never fetched
          { analyticsFetchedAt: { lt: twelveHoursAgo } }, // Fetched more than 12h ago
        ],
      },
      select: {
        id: true,
        laterPostId: true,
        postType: true,
        caption: true,
        sentAt: true,
        analyticsFetchedAt: true,
        Project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
      take: 100, // Limit to 100 posts per run to avoid rate limits
    })

    console.log(
      `[Later Analytics Cron] Found ${postsToFetch.length} posts to fetch analytics`
    )

    if (postsToFetch.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No posts to fetch analytics',
        updated: 0,
      })
    }

    // Fetch analytics from Later API
    const laterClient = getLaterClient()
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
    }

    for (const post of postsToFetch) {
      try {
        if (!post.laterPostId) {
          results.skipped++
          continue
        }

        console.log(
          `[Later Analytics Cron] Fetching analytics for post ${post.id} (Later: ${post.laterPostId})`
        )

        // Fetch analytics from Later API
        const analytics = await laterClient.getPostAnalytics(post.laterPostId)

        // Update post with analytics data
        await db.socialPost.update({
          where: { id: post.id },
          data: {
            analyticsLikes: analytics.metrics.likes,
            analyticsComments: analytics.metrics.comments,
            analyticsShares: analytics.metrics.shares || null,
            analyticsReach: analytics.metrics.reach || null,
            analyticsImpressions: analytics.metrics.impressions || null,
            analyticsEngagement: analytics.metrics.engagement,
            analyticsFetchedAt: new Date(),
          },
        })

        console.log(
          `[Later Analytics Cron] ✅ Updated analytics for post ${post.id}:`,
          {
            likes: analytics.metrics.likes,
            comments: analytics.metrics.comments,
            engagement: analytics.metrics.engagement,
          }
        )

        results.success++
      } catch (error) {
        console.error(
          `[Later Analytics Cron] ❌ Failed to fetch analytics for post ${post.id}:`,
          error
        )
        results.failed++

        // Continue with next post even if this one fails
        continue
      }
    }

    console.log('[Later Analytics Cron] Finished analytics fetch:', results)

    return NextResponse.json({
      success: true,
      message: 'Analytics fetch completed',
      results,
      totalProcessed: postsToFetch.length,
    })
  } catch (error) {
    console.error('[Later Analytics Cron] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
