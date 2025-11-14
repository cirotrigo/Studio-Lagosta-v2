/**
 * ADMIN: Inspect MVSEP files array structure
 * GET /api/admin/inspect-files?hash=X
 *
 * Returns only the files array with object keys to avoid truncation
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
        { error: 'Missing hash parameter' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${hash}`
    )

    const responseText = await response.text()
    const data = JSON.parse(responseText)

    // Extract just the files array
    const files = data?.data?.files || []

    // Create a summary without the full file content
    const filesSummary = files.map((file: any, index: number) => ({
      index,
      keys: Object.keys(file),
      sample: index === 0 ? file : undefined, // Only include first file's full data
    }))

    return NextResponse.json({
      hash,
      totalFiles: files.length,
      filesStructure: filesSummary,
      firstFileComplete: files[0] || null,
      status: data?.status,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
