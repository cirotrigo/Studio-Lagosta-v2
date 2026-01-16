import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { extractYoutubeId } from '@/lib/youtube/utils'
import { getYoutubeDownloadLink } from '@/lib/youtube/video-download-client'

const youtubeDownloadSchema = z.object({
  youtubeUrl: z.string().url(),
  nome: z.string().trim().min(1, 'Nome obrigatório').optional(),
  artista: z.string().trim().optional(),
  genero: z.string().trim().optional(),
  humor: z.string().trim().optional(),
  projectId: z
    .preprocess((value) => {
      if (value === null || value === undefined || value === '' || value === 'none') {
        return undefined
      }
      const parsed = Number(value)
      return Number.isNaN(parsed) ? undefined : parsed
    }, z.number().int().positive().optional()),
})

type YoutubeDownloadPayload = z.infer<typeof youtubeDownloadSchema>

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'Video download service not configured' }, { status: 500 })
    }

    const payload = (await req.json()) as Partial<YoutubeDownloadPayload>
    const data = youtubeDownloadSchema.parse(payload)

    const youtubeId = extractYoutubeId(data.youtubeUrl)
    if (!youtubeId) {
      return NextResponse.json({ error: 'URL do YouTube inválida' }, { status: 400 })
    }

    // Verificar se já existe job ativo
    const existingJob = await db.youtubeDownloadJob.findFirst({
      where: {
        youtubeId,
        createdBy: userId,
        status: { in: ['pending', 'downloading', 'uploading'] },
      },
    })

    if (existingJob) {
      return NextResponse.json(
        {
          error: 'Já existe um download em andamento para este link',
          jobId: existingJob.id,
        },
        { status: 409 }
      )
    }

    // Obter metadados do YouTube
    let metadata: { title?: string; thumbnail_url?: string } | null = null
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`
      const metaResponse = await fetch(oembedUrl)
      if (metaResponse.ok) {
        metadata = await metaResponse.json()
      }
    } catch {
      // Ignorar erro de metadata
    }

    // Obter link de download da API
    const downloadResult = await getYoutubeDownloadLink(youtubeId)

    if (!downloadResult.success) {
      // Se está processando, criar job e retornar para polling
      if (downloadResult.error === 'processing') {
        const job = await db.youtubeDownloadJob.create({
          data: {
            youtubeUrl: data.youtubeUrl,
            youtubeId,
            requestedName: data.nome ?? null,
            requestedArtist: data.artista ?? null,
            requestedGenre: data.genero ?? null,
            requestedMood: data.humor ?? null,
            projectId: data.projectId ?? null,
            createdBy: userId,
            title: metadata?.title ?? data.nome ?? null,
            thumbnail: metadata?.thumbnail_url ?? null,
            status: 'pending',
            videoApiStatus: 'processing',
          },
        })

        return NextResponse.json({
          success: true,
          jobId: job.id,
          status: 'processing',
          message: 'Vídeo está sendo convertido. Tente novamente em alguns segundos.',
        })
      }

      return NextResponse.json(
        { error: downloadResult.error || 'Falha ao obter link de download' },
        { status: 500 }
      )
    }

    // Criar job com link de download
    const job = await db.youtubeDownloadJob.create({
      data: {
        youtubeUrl: data.youtubeUrl,
        youtubeId,
        requestedName: data.nome ?? null,
        requestedArtist: data.artista ?? null,
        requestedGenre: data.genero ?? null,
        requestedMood: data.humor ?? null,
        projectId: data.projectId ?? null,
        createdBy: userId,
        title: downloadResult.title ?? metadata?.title ?? data.nome ?? null,
        thumbnail: metadata?.thumbnail_url ?? null,
        duration: downloadResult.duration ?? null,
        status: 'downloading',
        videoApiStatus: 'ready',
        startedAt: new Date(),
        progress: 50,
      },
    })

    console.log('[YOUTUBE] Job criado com link:', { jobId: job.id, youtubeId })

    return NextResponse.json({
      success: true,
      jobId: job.id,
      downloadLink: downloadResult.link,
      title: downloadResult.title ?? metadata?.title,
      thumbnail: metadata?.thumbnail_url,
      duration: downloadResult.duration,
      message: 'Link de download obtido. Baixe o arquivo e faça upload.',
    })
  } catch (error) {
    console.error('[YOUTUBE] Erro ao iniciar download:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Falha ao iniciar download' },
      { status: 500 }
    )
  }
}
