import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractYoutubeId } from '@/lib/youtube/utils'

const querySchema = z.object({
  url: z.string().url(),
})

interface YoutubeOEmbedResponse {
  title: string
  author_name: string
  thumbnail_url: string
  provider_name?: string
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const urlParam = searchParams.get('url')
    const parsed = querySchema.safeParse({ url: urlParam })
    if (!parsed.success) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }

    const youtubeUrl = parsed.data.url.trim()
    if (!extractYoutubeId(youtubeUrl)) {
      return NextResponse.json({ error: 'URL do YouTube inválida' }, { status: 400 })
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'StudioLagostaBot/1.0 (+https://lagostacriativa.com.br)' },
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return NextResponse.json({
        error: 'Não foi possível buscar os metadados do vídeo',
      }, { status: 400 })
    }

    const data = (await response.json()) as YoutubeOEmbedResponse

    return NextResponse.json({
      title: data.title,
      author: data.author_name,
      thumbnail: data.thumbnail_url,
      provider: data.provider_name,
      url: youtubeUrl,
    })
  } catch (error) {
    console.error('[YOUTUBE] Erro ao buscar metadados:', error)
    return NextResponse.json({ error: 'Falha ao buscar metadados do YouTube' }, { status: 500 })
  }
}
