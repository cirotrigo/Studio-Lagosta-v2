import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Temporary endpoint to verify environment variables
 * DELETE THIS FILE after verifying!
 */
export async function GET() {
  const bufferSecretExists = !!process.env.BUFFER_WEBHOOK_SECRET
  const instagramTokenExists = !!process.env.INSTAGRAM_ACCESS_TOKEN

  return NextResponse.json({
    BUFFER_WEBHOOK_SECRET: bufferSecretExists ? 'EXISTS' : 'MISSING',
    INSTAGRAM_ACCESS_TOKEN: instagramTokenExists ? 'EXISTS' : 'MISSING',
    bufferSecretLength: process.env.BUFFER_WEBHOOK_SECRET?.length || 0,
    instagramTokenLength: process.env.INSTAGRAM_ACCESS_TOKEN?.length || 0,
  })
}
