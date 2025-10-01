import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { Readable } from 'stream'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
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

    const { stream, mimeType, name } = await googleDriveService.getFileStream(fileId)
    const webStream = Readable.toWeb(stream)

    return new NextResponse(webStream as unknown as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
        'Cache-Control': 'public, max-age=300',
      },
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
