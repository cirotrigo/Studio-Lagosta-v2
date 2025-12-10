/**
 * DEBUG: Ver resposta RAW do MVSEP
 * GET /api/admin/debug-mvsep-response?hash=XXX
 */

import { NextRequest, NextResponse } from 'next/server'

const MVSEP_API_KEY = process.env.MVSEP_API_KEY || 'BrIkx8zYQbvc4TggAZbsL96Mag9WN5'
const MVSEP_API_URL = 'https://mvsep.com/api'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const hash = searchParams.get('hash')

    if (!hash) {
      return NextResponse.json(
        { error: 'Missing hash parameter. Usage: ?hash=20251114043051-ff12686013-audio.mp3' },
        { status: 400 }
      )
    }

    console.log('[DEBUG] Fetching MVSEP status for hash:', hash)

    const response = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${hash}`
    )

    const responseText = await response.text()
    console.log('[DEBUG] Raw response:', responseText)

    let data
    try {
      data = JSON.parse(responseText)
    } catch (_e) {
      return NextResponse.json({
        error: 'Invalid JSON from MVSEP',
        rawResponse: responseText,
      })
    }

    return NextResponse.json({
      hash,
      status: response.status,
      statusText: response.statusText,
      data,
      rawResponse: responseText,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
