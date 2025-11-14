/**
 * TEST: Testar chamada direta à API MVSEP
 * GET /api/admin/test-mvsep?musicId=X
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const MVSEP_API_KEY = process.env.MVSEP_API_KEY || 'BrIkx8zYQbvc4TggAZbsL96Mag9WN5'
const MVSEP_API_URL = 'https://mvsep.com/api'

export async function GET(req: NextRequest) {
  const logs: string[] = []

  try {
    const { searchParams } = new URL(req.url)
    const musicIdStr = searchParams.get('musicId')

    if (!musicIdStr) {
      return NextResponse.json({ error: 'Missing musicId parameter' }, { status: 400 })
    }

    const musicId = parseInt(musicIdStr)
    logs.push(`[TEST] Testing MVSEP API with music ID: ${musicId}`)

    // Buscar música
    const music = await db.musicLibrary.findUnique({
      where: { id: musicId },
    })

    if (!music) {
      return NextResponse.json({ error: 'Music not found' }, { status: 404 })
    }

    logs.push(`[TEST] Found music: ${music.name}`)
    logs.push(`[TEST] Blob URL: ${music.blobUrl}`)

    // Testar se a URL é acessível
    logs.push('[TEST] Testing if blob URL is publicly accessible...')
    try {
      const blobResponse = await fetch(music.blobUrl, { method: 'HEAD' })
      logs.push(`[TEST] Blob HEAD request: ${blobResponse.status} ${blobResponse.statusText}`)
      logs.push(`[TEST] Content-Type: ${blobResponse.headers.get('content-type')}`)
      logs.push(`[TEST] Content-Length: ${blobResponse.headers.get('content-length')}`)
    } catch (e) {
      logs.push(`[TEST] ERROR: Failed to access blob URL: ${e}`)
    }

    // Preparar request para MVSEP
    const requestBody = {
      api_token: MVSEP_API_KEY,
      url: music.blobUrl,
      separation_type: 37,
      output_format: 'mp3',
      remote_type: 'url',
    }

    logs.push('[TEST] Calling MVSEP API...')
    logs.push(`[TEST] Endpoint: ${MVSEP_API_URL}/separation/create`)
    logs.push(`[TEST] API Key length: ${MVSEP_API_KEY?.length || 0}`)
    logs.push(`[TEST] API Key starts with: ${MVSEP_API_KEY?.substring(0, 5)}...`)

    // Chamar MVSEP
    const response = await fetch(`${MVSEP_API_URL}/separation/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    logs.push(`[TEST] MVSEP Response Status: ${response.status} ${response.statusText}`)

    // Tentar parsear resposta
    let responseData: any
    const responseText = await response.text()
    logs.push(`[TEST] Response body (raw): ${responseText.substring(0, 500)}`)

    try {
      responseData = JSON.parse(responseText)
      logs.push(`[TEST] Response body (parsed):`)
      logs.push(JSON.stringify(responseData, null, 2))
    } catch (e) {
      logs.push(`[TEST] ERROR: Failed to parse response as JSON`)
      responseData = { raw: responseText }
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseData,
      logs,
      music: {
        id: music.id,
        name: music.name,
        blobUrl: music.blobUrl,
      },
    })
  } catch (error) {
    logs.push(`[TEST] EXCEPTION: ${error}`)
    logs.push(`[TEST] Stack: ${error instanceof Error ? error.stack : 'N/A'}`)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        logs,
      },
      { status: 500 }
    )
  }
}
