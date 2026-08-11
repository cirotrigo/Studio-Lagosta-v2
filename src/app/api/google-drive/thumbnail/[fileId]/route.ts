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

    /**
     * 🔴 O limite precisa ser EXPLÍCITO. O comentário original dizia "mais
     * generoso para thumbnails" — e não passava limite nenhum, caindo no
     * default de 100/hora por usuário. O seletor de fotos pede UMA miniatura
     * por foto da grade, então navegar o acervo queimava as 100 na primeira
     * tela e meia e TODA miniatura passava a responder 429 por uma hora —
     * inclusive as da fila da bancada. Quem tinha testado antes não via nada
     * (o cache de 1h do navegador respondia); quem chegava com cache frio via
     * as fotos quebradas sem pista. Foi exatamente assim que a equipe do Ciro
     * "não via as fotos" em 11/08/2026.
     *
     * 2.000/h cobre o acervo inteiro do maior cliente (~1.000 fotos) com folga
     * de navegação, e continua sendo um teto real contra loop de cliente.
     */
    assertRateLimit({ key: `drive:thumbnail:${userId}`, limit: 2_000 })

    const { searchParams } = new URL(request.url)
    const size = parseInt(searchParams.get('size') ?? '400', 10)

    // Get image stream from Google Drive
    // Note: getThumbnailStream returns full image, Next.js Image component handles optimization
    const { stream, mimeType, name } = await googleDriveService.getThumbnailStream(fileId, size)
    const webStream = Readable.toWeb(stream)

    return new NextResponse(webStream as unknown as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
        'Cache-Control': 'public, max-age=3600, immutable', // Aggressive cache for images
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[API] Failed to get Google Drive thumbnail', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json({
      error: 'Erro ao buscar thumbnail do Google Drive',
      details: errorMessage
    }, { status: 502 })
  }
}
