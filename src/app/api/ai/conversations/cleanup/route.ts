import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cleanup endpoint to delete expired conversations
 * Can be called by a cron job (e.g., Vercel Cron, GitHub Actions)
 *
 * Authorization: Requires CRON_SECRET environment variable
 *
 * Usage with Vercel Cron (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/ai/conversations/cleanup",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 *
 * Or call manually with:
 * curl -X POST https://yourdomain.com/api/ai/conversations/cleanup \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(req: Request) {
  try {
    // Security: Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    } else {
      console.warn('[CLEANUP] CRON_SECRET not set - cleanup endpoint is unprotected!')
    }

    // Delete all expired conversations
    const now = new Date()
    const result = await db.chatConversation.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    })

    console.log(`[CLEANUP] Deleted ${result.count} expired conversations`)

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('[CLEANUP] Error deleting expired conversations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint for manual testing
 * Returns count of expired conversations without deleting
 */
export async function GET() {
  try {
    const now = new Date()
    const count = await db.chatConversation.count({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    })

    return NextResponse.json({
      expiredCount: count,
      currentTime: now.toISOString(),
    })
  } catch (error) {
    console.error('[CLEANUP] Error counting expired conversations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
