import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredBlobs } from '@/lib/cleanup/blob-cleanup'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await cleanupExpiredBlobs()

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[CRON_CLEANUP]', error)
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    )
  }
}
