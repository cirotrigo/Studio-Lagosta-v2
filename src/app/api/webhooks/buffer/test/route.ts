import { NextResponse } from 'next/server'

/**
 * Deprecated: Buffer/Zapier webhook test endpoint.
 * Late API is the only supported provider.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Deprecated endpoint. Zapier/Buffer no longer supported.' },
    { status: 410 }
  )
}
