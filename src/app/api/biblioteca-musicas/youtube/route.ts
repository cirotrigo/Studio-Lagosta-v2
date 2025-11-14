import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

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

    if (!process.env.VIDEO_DOWNLOAD_API_KEY) {
      return NextResponse.json({ error: 'Video download service not configured' }, { status: 500 })
    }

    const payload = (await req.json()) as Partial<YoutubeDownloadPayload>
    const data = youtubeDownloadSchema.parse(payload)

    const youtubeId = extractYoutubeId(data.youtubeUrl)
    if (!youtubeId) {
      return NextResponse.json({ error: 'URL do YouTube inválida' }, { status: 400 })
    }

    const existingJob = await db.youtubeDownloadJob.findFirst({
      where: {
        youtubeUrl: data.youtubeUrl,
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
        title: data.nome ?? null,
      },
    })

    console.log('[YOUTUBE] Job criado:', { jobId: job.id, youtubeUrl: data.youtubeUrl, userId })

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Download iniciado. Você será notificado quando estiver pronto.',
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

function extractYoutubeId(url: string) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}
