/**
 * Cron Job: Fetch Story Insights from Instagram Graph API
 * Runs every 12 hours to fetch analytics for Stories before they expire (24h)
 *
 * Stories expire after 24 hours on Instagram, so we need to fetch their
 * insights before that. This cron job processes Stories that:
 * - Were posted in the last 24 hours
 * - Have verifiedStoryId (Instagram media ID)
 * - Don't have analytics yet
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { InstagramGraphApiClient, InstagramApiException } from '@/lib/instagram/graph-api-client'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max

/**
 * Cron job to fetch Story insights from Instagram Graph API
 * Schedule: Every 12 hours
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[Story Insights Cron] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Story Insights Cron] Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Story Insights Cron] Starting Story insights fetch...')

    // Find Stories posted in the last 24 hours that need insights
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const storiesToFetch = await db.socialPost.findMany({
      where: {
        postType: 'STORY',
        status: 'POSTED',
        verifiedStoryId: {
          not: null,
        },
        sentAt: {
          gte: twentyFourHoursAgo, // Posted within last 24 hours
        },
        OR: [
          { analyticsFetchedAt: null }, // Never fetched
          { analyticsReach: null }, // No analytics data
        ],
      },
      select: {
        id: true,
        verifiedStoryId: true,
        caption: true,
        sentAt: true,
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
      take: 100, // Limit to avoid rate limits
    })

    console.log(
      `[Story Insights Cron] Found ${storiesToFetch.length} Stories to fetch insights`
    )

    if (storiesToFetch.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Stories to fetch insights',
        processed: 0,
      })
    }

    // Fetch insights from Instagram Graph API
    const igClient = new InstagramGraphApiClient()
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ storyId: string; error: string }>,
    }

    for (const story of storiesToFetch) {
      try {
        if (!story.verifiedStoryId) {
          results.skipped++
          continue
        }

        // Check if story is still within 24h window
        const storyAge = Date.now() - (story.sentAt?.getTime() || 0)
        const hoursOld = storyAge / (1000 * 60 * 60)

        if (hoursOld > 24) {
          console.log(
            `[Story Insights Cron] ⏰ Story ${story.id} is too old (${hoursOld.toFixed(1)}h), skipping`
          )
          results.skipped++
          continue
        }

        console.log(
          `[Story Insights Cron] Fetching insights for Story ${story.id} (${story.Project.name})`
        )
        console.log(`   Instagram Media ID: ${story.verifiedStoryId}`)
        console.log(`   Age: ${hoursOld.toFixed(1)} hours`)

        // Fetch insights from Instagram
        const insights = await igClient.getStoryInsights(story.verifiedStoryId)

        // Calculate engagement (replies + taps)
        const engagement =
          (insights.replies || 0) +
          (insights.taps_forward || 0) +
          (insights.taps_back || 0)

        // Update database
        await db.socialPost.update({
          where: { id: story.id },
          data: {
            analyticsImpressions: insights.impressions || 0,
            analyticsReach: insights.reach || 0,
            analyticsComments: insights.replies || 0, // Using replies as comments
            analyticsEngagement: engagement,
            analyticsFetchedAt: new Date(),
          },
        })

        console.log(
          `[Story Insights Cron] ✅ Updated Story ${story.id}:`,
          {
            impressions: insights.impressions,
            reach: insights.reach,
            replies: insights.replies,
            engagement,
          }
        )

        results.success++
      } catch (error) {
        console.error(
          `[Story Insights Cron] ❌ Failed to fetch insights for Story ${story.id}:`,
          error
        )

        // Handle specific Instagram API errors
        if (error instanceof InstagramApiException) {
          const errorMsg = `${error.message} (code: ${error.code || 'N/A'})`

          if (error.isTokenError) {
            console.error('[Story Insights Cron] Token error - check INSTAGRAM_ACCESS_TOKEN')
          } else if (error.isRateLimited) {
            console.error('[Story Insights Cron] Rate limited - will retry later')
          } else if (error.isPermissionError) {
            console.error('[Story Insights Cron] Permission error - check Instagram account permissions')
          }

          results.errors.push({
            storyId: story.id,
            error: errorMsg,
          })
        } else {
          results.errors.push({
            storyId: story.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }

        results.failed++
        continue
      }
    }

    console.log('[Story Insights Cron] Finished insights fetch:', results)

    return NextResponse.json({
      success: true,
      message: 'Story insights fetch completed',
      results: {
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
      },
      totalProcessed: storiesToFetch.length,
      errors: results.errors.length > 0 ? results.errors : undefined,
    })
  } catch (error) {
    console.error('[Story Insights Cron] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
