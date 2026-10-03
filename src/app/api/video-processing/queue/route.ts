import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { CreativeError } from '@/lib/creatives/errors'
import { put } from '@vercel/blob'
import { destinoSchema, type DestinoDoVideo } from '@/lib/video/destino-do-video'
import { criarJobDeVideo, prepararVideoDaPagina } from '@/lib/video/enfileirar-video'
import { processVideoJob } from '@/lib/video/process-video-job'

export const runtime = 'nodejs'
// A conversão roda no `after()` desta rota; o teto do Vercel vai inline
// (o glob do vercel.json não casa `src/app/**`).
export const maxDuration = 300

const audioConfigSchema = z.object({
  source: z.enum(['original', 'library', 'mute', 'mix']),
  musicId: z.number().int().optional(),
  audioVersion: z.enum(['original', 'instrumental', 'vocals']).optional(),
  musicName: z.string().optional(),
  musicThumbnailUrl: z.string().nullable().optional(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  volume: z.number().min(0).max(100),
  volumeOriginal: z.number().min(0).max(100).optional(),
  volumeMusic: z.number().min(0).max(100).optional(),
  fadeIn: z.boolean(),
  fadeOut: z.boolean(),
  fadeInDuration: z.number().min(0),
  fadeOutDuration: z.number().min(0),
})

const queueVideoSchema = z
  .object({
    templateId: z.coerce.number().int(),
    projectId: z.coerce.number().int(),
    videoName: z.string(),
    // Teto da linha do tempo (Fase 3): 10 clipes de até 60 s nunca passam de 180 s
    videoDuration: z.coerce.number().positive().max(180, 'O vídeo passa de 3 minutos (180 s). Encurte a linha do tempo e exporte de novo.'),
    videoWidth: z.coerce.number().positive(),
    videoHeight: z.coerce.number().positive(),
    // Trilha sonora do export: o WebM chega MUDO e o processor mixa via ffmpeg
    audioConfig: audioConfigSchema.nullable().optional(),
    webmBlob: z.string().optional(), // Base64 encoded WebM video (legacy fallback)
    webmBlobUrl: z.string().url().optional(), // Direct Vercel Blob URL (preferred)
    webmBlobSize: z.coerce.number().int().positive().optional(), // Size in bytes when using webmBlobUrl
    thumbnailBlob: z.string().optional(), // Base64 encoded thumbnail (fallback)
    thumbnailBlobUrl: z.string().url().optional(), // Direct Blob URL for thumbnail
    thumbnailBlobSize: z.coerce.number().int().positive().optional(), // Size in bytes for thumbnail blob URL
    designData: z.any(), // Template design data
    /** A página gravada: liga o vídeo à página (agenda, "Editar vídeo", substituição). */
    pageId: z.string().min(1).optional(),
    /** Para onde vai o vídeo quando ficar pronto (padrão: só a galeria). */
    destino: destinoSchema.optional(),
  })
  .refine(
    (data) => Boolean(data.webmBlob) || Boolean(data.webmBlobUrl && data.webmBlobSize),
    {
      message: 'Envie webmBlob ou webmBlobUrl/webmBlobSize',
      path: ['webmBlob'],
    }
  )
  .refine(
    (data) => Boolean(data.thumbnailBlob) || Boolean(data.thumbnailBlobUrl),
    {
      message: 'Envie thumbnailBlob ou thumbnailBlobUrl',
      path: ['thumbnailBlob'],
    }
  )

/**
 * POST /api/video-processing/queue
 * Adiciona um vídeo WebM à fila de processamento
 */
export async function POST(request: Request) {
  const { userId: clerkUserId, orgId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = queueVideoSchema.parse(await request.json())

    console.log('[Queue Video] Iniciando enfileiramento:', {
      clerkUserId,
      orgId,
      templateId: body.templateId,
      projectId: body.projectId,
      videoName: body.videoName,
    })

    // 1. Obter usuário do banco
    const user = await getUserFromClerkId(clerkUserId)

    // 2. Validar créditos ANTES de adicionar à fila
    await validateCreditsForFeature(clerkUserId, 'video_export', 1, {
      organizationId: orgId ?? undefined,
    })

    // Validate project access: owner OR organization member
    console.log('[Queue Video] Validando acesso ao projeto:', {
      projectId: body.projectId,
      clerkUserId,
      userId: user.id,
      orgId,
    })

    const project = await db.project.findFirst({
      where: {
        id: body.projectId,
        OR: [
          // Direct ownership
          { userId: clerkUserId },
          { userId: user.id },
          // Shared with organization (need to query through organization.clerkOrgId)
          ...(orgId
            ? [
                {
                  organizationProjects: {
                    some: {
                      organization: {
                        clerkOrgId: orgId,
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        userId: true,
        name: true,
        organizationProjects: {
          select: {
            organizationId: true,
            sharedBy: true,
            organization: {
              select: {
                clerkOrgId: true,
                name: true,
              }
            }
          }
        }
      },
    })

    console.log('[Queue Video] Resultado da validação:', {
      found: !!project,
      project: project ? {
        id: project.id,
        userId: project.userId,
        orgProjects: project.organizationProjects,
      } : null,
    })

    if (!project) {
      // Let's also check if the project exists at all
      const projectExists = await db.project.findUnique({
        where: { id: body.projectId },
        select: {
          id: true,
          userId: true,
          organizationProjects: {
            select: {
              organizationId: true,
            }
          }
        },
      })

      console.log('[Queue Video] Projeto existe?', {
        exists: !!projectExists,
        details: projectExists,
      })

      return NextResponse.json(
        { error: 'Projeto não encontrado ou acesso negado' },
        { status: 404 }
      )
    }

    // O destino é validado ANTES de qualquer upload ou cobrança.
    const preparo = await prepararVideoDaPagina({
      projectId: body.projectId,
      templateId: body.templateId,
      pageId: body.pageId,
      destino: (body.destino ?? { tipo: 'galeria' }) as DestinoDoVideo,
      designData: body.designData,
      videoWidth: body.videoWidth,
      videoHeight: body.videoHeight,
    })
    if (preparo.ok === false) return NextResponse.json({ error: preparo.error }, { status: preparo.status })

    let webmBlobUrl = body.webmBlobUrl ?? null
    let webmFileSize = body.webmBlobSize ?? null
    let thumbnailUrl = body.thumbnailBlobUrl ?? null

    if (body.webmBlob) {
      // 3a. Decodificar base64 e converter para Blob (modo legado)
      const base64Data = body.webmBlob.split(',')[1] || body.webmBlob
      const binaryData = Buffer.from(base64Data, 'base64')

      console.log('[Queue Video] Fazendo upload do WebM (legacy base64) para Vercel Blob...')
      const webmFilename = `video-processing/${clerkUserId}/${Date.now()}-${body.videoName}.webm`

      const uploadResult = await put(webmFilename, binaryData, {
        access: 'public',
        contentType: 'video/webm',
      })

      webmBlobUrl = uploadResult.url
      webmFileSize = binaryData.length
      console.log('[Queue Video] WebM uploaded (legacy flow):', webmBlobUrl)
    } else if (webmBlobUrl) {
      // 3b. Validação básica do WebM já enviado para o Blob
      try {
        const { hostname } = new URL(webmBlobUrl)
        const normalizedHost = hostname.toLowerCase()
        const isAllowedHost =
          normalizedHost === 'public.blob.vercel-storage.com' ||
          normalizedHost === 'blob.vercel-storage.com' ||
          normalizedHost.endsWith('.public.blob.vercel-storage.com')

        if (!isAllowedHost) {
          throw new Error(`Host de upload não permitido: ${hostname}`)
        }
      } catch (error) {
        console.error('[Queue Video] URL inválida para webmBlobUrl:', webmBlobUrl, error)
        return NextResponse.json({ error: 'URL inválida para vídeo WebM' }, { status: 400 })
      }

      if (!webmFileSize) {
        console.warn('[Queue Video] webmBlobSize ausente para upload direto. Tentando obter via HEAD...')
        try {
          const headResponse = await fetch(webmBlobUrl, { method: 'HEAD' })
          const contentLength = headResponse.headers.get('content-length')
          if (contentLength) {
            webmFileSize = Number(contentLength)
          }
        } catch (error) {
          console.warn('[Queue Video] Falha ao obter tamanho via HEAD:', error)
        }
      }
    }

    if (!webmBlobUrl || !webmFileSize) {
      return NextResponse.json(
        { error: 'Falha ao determinar URL ou tamanho do WebM' },
        { status: 400 }
      )
    }

    if (body.thumbnailBlob) {
      const base64Data = body.thumbnailBlob.split(',')[1] || body.thumbnailBlob
      const binaryData = Buffer.from(base64Data, 'base64')

      console.log('[Queue Video] Upload da thumbnail (legacy base64) para Vercel Blob...')
      const thumbnailFilename = `video-thumbnails/${clerkUserId}/${Date.now()}-${body.videoName}.jpg`

      const uploadResult = await put(thumbnailFilename, binaryData, {
        access: 'public',
        contentType: 'image/jpeg',
      })

      thumbnailUrl = uploadResult.url
      console.log('[Queue Video] Thumbnail uploaded (legacy flow):', thumbnailUrl)
    } else if (thumbnailUrl) {
      try {
        const { hostname } = new URL(thumbnailUrl)
        const normalizedHost = hostname.toLowerCase()
        const isAllowedHost =
          normalizedHost === 'public.blob.vercel-storage.com' ||
          normalizedHost === 'blob.vercel-storage.com' ||
          normalizedHost.endsWith('.public.blob.vercel-storage.com')

        if (!isAllowedHost) {
          throw new Error(`Host de upload não permitido para thumbnail: ${hostname}`)
        }
      } catch (error) {
        console.error('[Queue Video] URL inválida para thumbnailBlobUrl:', thumbnailUrl, error)
        return NextResponse.json({ error: 'URL inválida para thumbnail' }, { status: 400 })
      }
    }

    if (!thumbnailUrl) {
      console.warn('[Queue Video] Thumbnail não fornecida. Será usada imagem padrão.')
    }

    const job = await criarJobDeVideo({
      user,
      clerkUserId,
      orgId: orgId ?? null,
      project,
      templateId: body.templateId,
      videoName: body.videoName,
      videoDuration: body.videoDuration,
      videoWidth: body.videoWidth,
      videoHeight: body.videoHeight,
      webmBlobUrl,
      webmFileSize,
      thumbnailUrl,
      designData: body.designData,
      audioConfig: body.audioConfig ?? null,
      videoDaPagina: preparo.videoDaPagina,
    })

    console.log('[Queue Video] Job criado com sucesso:', job.jobId)

    // Processa já, nesta invocação; o cron de vídeo é a rede (a aba pode fechar).
    after(async () => {
      try {
        await processVideoJob(job.jobId)
      } catch (error) {
        console.error('[Queue Video] Falha no processamento imediato — o cron retoma:', error)
      }
    })

    // 6. Retornar ID do job para polling
    return NextResponse.json({
      success: true,
      jobId: job.jobId,
      generationId: job.generationId,
      thumbnailUrl,
      message: 'Vídeo adicionado à fila de processamento',
    })
  } catch (error) {
    console.error('[Queue Video] Erro ao enfileirar vídeo:', error)

    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: 'Créditos insuficientes para processar vídeo',
          details: {
            required: error.required,
            available: error.available,
          },
        },
        { status: 402 }
      )
    }

    // A substituição recusada no commit do pedido (o post mudou durante o upload).
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Dados inválidos para enfileirar vídeo',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'Falha ao adicionar vídeo à fila',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
