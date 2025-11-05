import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { PostScheduler } from '@/lib/posts/scheduler'

/**
 * POST /api/posts/check-stuck
 * Check for posts stuck in POSTING status and mark them as FAILED
 * This endpoint can be called by a cron job
 */
export async function POST() {
  try {
    const { userId } = await auth()

    // Allow unauthenticated requests from cron jobs
    // but you can add a secret token check here if needed
    if (!userId) {
      // Check for a secret token in headers for cron jobs
      // const token = headers().get('x-cron-secret')
      // if (token !== process.env.CRON_SECRET) {
      //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      // }
    }

    const scheduler = new PostScheduler()
    const result = await scheduler.checkStuckPosts()

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
