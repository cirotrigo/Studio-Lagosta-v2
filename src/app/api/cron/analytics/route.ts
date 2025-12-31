/**
 * Cron job for fetching Late analytics
 * Runs every 6 HOURS (4x/day)
 * Rate limit: 30 req/hour (Analytics add-on)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PostStatus } from '@prisma/client'
import { getLaterClient } from '@/lib/later/client'

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const laterClient = getLaterClient()

    // Find posts needing analytics update (>24h or never fetched)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const postsNeedingAnalytics = await db.socialPost.findMany({
      where: {
        status: PostStatus.POSTED,
        laterPostId: { not: null },
        latePlatformUrl: { not: null }, // Only posts with URL (published)
        OR: [
          { analyticsFetchedAt: null }, // Never fetched
          { analyticsFetchedAt: { lt: yesterday } } // More than 24h
        ]
      },
      take: 25, // Max 25 posts per execution (rate limit)
      orderBy: { latePublishedAt: 'desc' } // Most recent first
    })

    if (postsNeedingAnalytics.length === 0) {
      console.log('✅ [Late Analytics] No posts need analytics update')
      return NextResponse.json({ success: true, updated: 0 })
    }

    console.log(`📊 [Late Analytics] Fetching analytics for ${postsNeedingAnalytics.length} posts...`)

    let updated = 0
    let failed = 0

    for (const post of postsNeedingAnalytics) {
      try {
        // Fetch analytics from Late
        const analytics = await laterClient.getPostAnalytics(post.laterPostId!)

        // Update DB
        await db.socialPost.update({
          where: { id: post.id },
          data: {
            analyticsLikes: analytics.metrics.likes,
            analyticsComments: analytics.metrics.comments,
            analyticsShares: analytics.metrics.shares || 0,
            analyticsReach: analytics.metrics.reach,
            analyticsImpressions: analytics.metrics.impressions,
            analyticsEngagement: analytics.metrics.engagement,
            analyticsFetchedAt: new Date()
          }
        })

        updated++
        console.log(`✅ [Late Analytics] Updated post ${post.id}: ${analytics.metrics.likes} likes`)

      } catch (error: any) {
        console.error(`❌ [Late Analytics] Failed for post ${post.id}:`, error)
        failed++

        // Handle 402 error (Analytics add-on not active)
        if (error.statusCode === 402) {
          console.error('⚠️ [Late Analytics] Analytics add-on not active - stopping')
          break
        }

        // Handle rate limit
        if (error.statusCode === 429) {
          const resetTime = error.rateLimitInfo?.reset
          console.warn(`⚠️ [Late Analytics] Rate limit exceeded. Reset at: ${resetTime}`)
          break
        }
      }

      // Delay to respect rate limit (30 req/hour = 2 req/min)
      await new Promise(resolve => setTimeout(resolve, 2500)) // 2.5s between requests
    }

    console.log(`✅ [Late Analytics] Complete: ${updated} updated, ${failed} failed`)

    return NextResponse.json({
      success: true,
      updated,
      failed,
      total: postsNeedingAnalytics.length
    })

  } catch (error) {
    console.error('[Late Analytics] Cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
