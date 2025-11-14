import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/export/video/upload-url
 * Gera URL de upload assinada para Vercel Blob (client upload direto)
 *
 * Body: { filename: string }
 * Returns: { url: string, token: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('videos/')) {
          console.warn('[UPLOAD_URL] Invalid pathname attempt:', pathname, 'user:', userId)
          throw new Error('Invalid pathname')
        }

        console.log('[UPLOAD_URL] Generating upload token for:', pathname, 'user:', userId)

        return {
          allowedContentTypes: [
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'image/jpeg',
            'image/png',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB max
          tokenPayload: JSON.stringify({
            userId,
            uploadedAt: new Date().toISOString(),
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Callback opcional quando upload completa
        console.log('[UPLOAD_URL] Upload completed:', blob.url)

        try {
          const payload = JSON.parse(tokenPayload || '{}')
          console.log('[UPLOAD_URL] Upload by user:', payload.userId)
        } catch (e) {
          console.error('[UPLOAD_URL] Failed to parse token payload:', e)
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[UPLOAD_URL] Failed to generate upload URL:', error)
    return NextResponse.json(
      {
        error: 'Erro ao gerar URL de upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
