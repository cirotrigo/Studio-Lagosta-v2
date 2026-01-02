import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Deprecated: Buffer/Zapier webhook endpoint.
 * Late API is the only supported provider.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Deprecated webhook. Zapier/Buffer no longer supported.' },
    { status: 410 }
  )
}
