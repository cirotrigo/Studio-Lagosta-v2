import { NextRequest, NextResponse } from 'next/server'
import { PostExecutor } from '@/lib/posts/executor'

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication (Vercel Cron secret)
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const executor = new PostExecutor()

    // Execute scheduled posts
    const scheduledResult = await executor.executeScheduledPosts()

    // Execute retries
    const retryResult = await executor.executeRetries()

    return NextResponse.json({
      success: true,
      scheduled: scheduledResult,
      retries: retryResult,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
