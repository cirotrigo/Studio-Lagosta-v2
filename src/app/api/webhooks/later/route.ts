import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Deprecated: Later webhook endpoint.
 * Use /api/webhooks/late instead.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Deprecated webhook. Use /api/webhooks/late.' },
    { status: 410 }
  )
}
