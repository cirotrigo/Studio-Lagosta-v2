/**
 * Cron job for Late status synchronization
 * Runs every 1 HOUR as fallback for webhook
 * Webhook is the primary method - this is backup
 */

import { NextRequest, NextResponse } from 'next/server'
import { PostExecutor } from '@/lib/posts/executor'

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron Status Sync] Starting Late status sync (fallback)...')

    const executor = new PostExecutor()
    const syncResult = await executor.syncLateStatus()

    console.log('[Cron Status Sync] Complete:', syncResult)

    return NextResponse.json({
      success: true,
      sync: syncResult,
    })
  } catch (error) {
    console.error('[Cron Status Sync] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
