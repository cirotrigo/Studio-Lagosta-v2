/**
 * POST /api/biblioteca-musicas/upload-url
 * Gera URL assinada para upload direto ao Vercel Blob (client-side)
 *
 * Isso contorna o limite de 4.5MB do Next.js API Routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname: string) => {
        // Validação de segurança: apenas músicas
        if (!pathname.startsWith('musicas/')) {
          throw new Error('Invalid pathname')
        }

        return {
          allowedContentTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-m4a'],
          tokenPayload: JSON.stringify({
            userId,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[Upload] Completed:', blob.url, 'by user:', tokenPayload)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[Upload URL] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
