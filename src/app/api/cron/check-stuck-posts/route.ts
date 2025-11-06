import { NextRequest, NextResponse } from 'next/server'
import { PostScheduler } from '@/lib/posts/scheduler'

/**
 * GET /api/cron/check-stuck-posts
 * Check for posts stuck in POSTING status and mark them as FAILED
 * This endpoint is called by Vercel Cron every 10 minutes
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication (Vercel Cron secret)
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('❌ Check stuck posts: Unauthorized - invalid CRON_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔍 Checking for stuck posts...')

    const scheduler = new PostScheduler()
    const result = await scheduler.checkStuckPosts()

    console.log(`✅ Check complete. Updated ${result.updated} stuck posts.`)

    return NextResponse.json({
      success: true,
      message: `Checked for stuck posts. Updated ${result.updated} posts.`,
      updatedCount: result.updated,
    })
  } catch (error) {
    console.error('❌ Error checking stuck posts:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
