import { NextResponse } from 'next/server'
import { refillOrganizationCredits } from '@/lib/organizations'

export const runtime = 'nodejs'

/**
 * Cron job endpoint to refill organization credits monthly
 *
 * This endpoint should be called by a cron service (e.g., Vercel Cron, GitHub Actions)
 * on a monthly schedule.
 *
 * Security: Protect this endpoint with a secret token in production
 *
 * Example cron schedule (vercel.json):
 * ```json
 * {
 *   "crons": [{
 *     "path": "/api/cron/refill-org-credits",
 *     "schedule": "0 0 1 * *"
 *   }]
 * }
 * ```
 */
export async function GET(req: Request) {
  try {
    // Security: Verify authorization token
    const authHeader = req.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const refillCount = await refillOrganizationCredits()

    return NextResponse.json({
      success: true,
      message: `Successfully refilled credits for ${refillCount} organizations`,
      refillCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Failed to refill organization credits', error)
    return NextResponse.json(
      {
        error: 'Failed to refill organization credits',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export async function POST(req: Request) {
  return GET(req)
}
