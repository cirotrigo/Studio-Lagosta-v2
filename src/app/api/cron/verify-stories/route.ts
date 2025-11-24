import { NextRequest, NextResponse } from 'next/server'
import { StoryVerifier } from '@/lib/posts/verification/story-verifier'

export const runtime = 'nodejs'

async function handleRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const verifier = new StoryVerifier()
    const summary = await verifier.processPendingVerifications()

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error('[Cron] verify-stories error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return handleRequest(req)
}

export async function GET(req: NextRequest) {
  return handleRequest(req)
}
