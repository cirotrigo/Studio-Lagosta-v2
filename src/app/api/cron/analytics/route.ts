/**
 * Deprecated analytics cron.
 * Use /api/cron/fetch-later-analytics instead.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Deprecated analytics cron. Use /api/cron/fetch-later-analytics.' },
    { status: 410 }
  )
}
