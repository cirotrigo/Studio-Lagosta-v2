import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { extrairCapaDeVideo, videoDoBlob } from '@/lib/video/capa-de-video'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/video-thumb?url=<mp4 no Blob>
 *
 * A capa de um vídeo para os cards da agenda. Sem isto o card de vídeo era um
 * ícone, e ninguém sabia qual vídeo era qual. O porquê de ser no servidor está
 * em `src/lib/video/capa-de-video.ts`.
 *
 * ponytail: a capa é "guardada" só no cache (navegador e CDN — a URL do Blob é
 * imutável). Se a CDN não segurar a resposta e o ffmpeg rodar a cada visita,
 * o passo seguinte é gravar o JPEG no Blob em caminho determinístico.
 */
export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const origem = videoDoBlob(new URL(req.url).searchParams.get('url') ?? '')
  if (!origem) {
    return NextResponse.json({ error: 'URL de vídeo inválida' }, { status: 400 })
  }

  let jpeg: Buffer | null
  try {
    jpeg = await extrairCapaDeVideo(origem)
  } catch (error) {
    console.error('[video-thumb] ffmpeg indisponível:', error)
    return NextResponse.json({ error: 'ffmpeg indisponível' }, { status: 503 })
  }

  if (!jpeg) {
    // Vídeo morto: o card cai no ícone. Cache curto para a agenda não rodar o
    // ffmpeg de novo a cada visita.
    return NextResponse.json(
      { error: 'Não foi possível ler o vídeo' },
      { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } },
    )
  }

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
