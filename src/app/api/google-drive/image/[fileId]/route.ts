import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { Readable } from 'stream'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'

export const runtime = 'nodejs'

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

    assertRateLimit({ key: `drive:image:${userId}` })

    const rangeHeader = request.headers.get('range') ?? undefined
    const {
      stream,
      mimeType,
      name,
      size,
      contentLength,
      contentRange,
    } = await googleDriveService.getFileStream(fileId, rangeHeader)
    const webStream = Readable.toWeb(stream)

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
      'Cache-Control': 'public, max-age=300',
      'Accept-Ranges': 'bytes',
    }

    let status = 200

    if (rangeHeader) {
      status = 206
      headers['Accept-Ranges'] = 'bytes'
      let fallbackRange: { start: number; end?: number } | undefined
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d+)?/i)
      if (rangeMatch) {
        const start = Number(rangeMatch[1])
        const end = rangeMatch[2] ? Number(rangeMatch[2]) : size ? size - 1 : undefined
        fallbackRange = { start, end }
      }
      const computedRange =
        contentRange ??
        (fallbackRange && typeof fallbackRange.end === 'number' && size
          ? `bytes ${fallbackRange.start}-${fallbackRange.end}/${size}`
          : undefined)
      if (computedRange) {
        headers['Content-Range'] = computedRange
      }
      if (contentLength) {
        headers['Content-Length'] = contentLength
      } else if (computedRange) {
        const match = computedRange.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i)
        if (match) {
          const start = Number(match[1])
          const end = Number(match[2])
          headers['Content-Length'] = String(end - start + 1)
        }
      }
    } else if (contentLength) {
      headers['Content-Length'] = contentLength
    } else if (typeof size === 'number') {
      headers['Content-Length'] = String(size)
    }

    return new NextResponse(webStream as unknown as BodyInit, {
      status,
      headers,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[API] Failed to stream Google Drive file', error)
    return NextResponse.json({ error: 'Erro ao ler arquivo do Google Drive' }, { status: 502 })
  }
}
