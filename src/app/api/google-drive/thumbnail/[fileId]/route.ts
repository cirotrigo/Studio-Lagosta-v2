import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { Readable } from 'stream'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * GET /api/google-drive/thumbnail/[fileId]
 * Retorna o thumbnail de uma imagem do Google Drive com autenticação
 * Suporta query params: ?size=400 (default: 400)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { fileId } = await params
    if (!fileId) {
      return NextResponse.json({ error: 'ID do arquivo obrigatório' }, { status: 400 })
    }

    // Rate limiting mais generoso para thumbnails (usa cache)
    assertRateLimit({ key: `drive:thumbnail:${userId}` })

    const { searchParams } = new URL(request.url)
    const size = parseInt(searchParams.get('size') ?? '400', 10)

    // Tentar obter thumbnail otimizado
    try {
      const { stream, mimeType, name } = await googleDriveService.getThumbnailStream(fileId, size)
      const webStream = Readable.toWeb(stream)

      return new NextResponse(webStream as unknown as BodyInit, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
          'Cache-Control': 'public, max-age=3600, immutable', // Cache agressivo para thumbnails
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (thumbnailError) {
      console.warn(`[API] Thumbnail not available for ${fileId}, falling back to full image:`, thumbnailError instanceof Error ? thumbnailError.message : 'Unknown error')

      try {
        // Fallback: retornar imagem completa se thumbnail não disponível
        const { stream, mimeType, name } = await googleDriveService.getFileStream(fileId)
        const webStream = Readable.toWeb(stream)

        return new NextResponse(webStream as unknown as BodyInit, {
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
            'Cache-Control': 'public, max-age=3600',
            'X-Thumbnail-Fallback': 'true',
          },
        })
      } catch (fallbackError) {
        console.error(`[API] Both thumbnail and full image failed for ${fileId}:`, fallbackError)
        throw fallbackError // Re-throw para ser capturado pelo catch externo
      }
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[API] Failed to get Google Drive thumbnail', error)
    return NextResponse.json({ error: 'Erro ao buscar thumbnail do Google Drive' }, { status: 502 })
  }
}
