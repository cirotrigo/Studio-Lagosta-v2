import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { validateCreditsForFeature } from '@/lib/credits/deduct'
import { put } from '@vercel/blob'

const queueVideoSchema = z
  .object({
    templateId: z.number(),
    projectId: z.number(),
    videoName: z.string(),
    videoDuration: z.number().positive(),
    videoWidth: z.number().positive(),
    videoHeight: z.number().positive(),
    webmBlob: z.string().optional(), // Base64 encoded WebM video (legacy fallback)
    webmBlobUrl: z.string().url().optional(), // Direct Vercel Blob URL (preferred)
    webmBlobSize: z.number().int().positive().optional(), // Size in bytes when using webmBlobUrl
    thumbnailBlob: z.string().optional(), // Base64 encoded thumbnail (fallback)
    thumbnailBlobUrl: z.string().url().optional(), // Direct Blob URL for thumbnail
    thumbnailBlobSize: z.number().int().positive().optional(), // Size in bytes for thumbnail blob URL
    designData: z.any(), // Template design data
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
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = queueVideoSchema.parse(await request.json())

    console.log('[Queue Video] Iniciando enfileiramento:', {
      clerkUserId,
      templateId: body.templateId,
      projectId: body.projectId,
      videoName: body.videoName,
    })

    // 1. Obter usuário do banco
    const user = await getUserFromClerkId(clerkUserId)

    // 2. Validar créditos ANTES de adicionar à fila
    await validateCreditsForFeature(clerkUserId, 'video_export')

    const project = await db.project.findUnique({
      where: { id: body.projectId },
      select: { id: true, userId: true, name: true },
    })

    if (!project || project.userId !== user.id) {
      return NextResponse.json(
        { error: 'Projeto não encontrado ou não pertence ao usuário' },
        { status: 404 }
      )
    }

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

    const baseFieldValues = {
      videoExport: true,
      isVideo: true,
      progress: 0,
      thumbnailUrl,
      videoDuration: body.videoDuration,
      videoWidth: body.videoWidth,
      videoHeight: body.videoHeight,
    }

    const { job, generation } = await db.$transaction(async (tx) => {
      const createdGeneration = await tx.generation.create({
        data: {
          templateId: body.templateId,
          projectId: body.projectId,
          createdBy: clerkUserId,
          status: 'PROCESSING',
          templateName: body.videoName,
          projectName: project.name,
          fieldValues: baseFieldValues,
          resultUrl: thumbnailUrl,
        },
      })

      const createdJob = await tx.videoProcessingJob.create({
        data: {
          userId: user.id,
          clerkUserId,
          templateId: body.templateId,
          projectId: body.projectId,
          status: 'PENDING',
          webmBlobUrl,
          webmFileSize,
          thumbnailUrl: thumbnailUrl ?? undefined,
          videoName: body.videoName,
          videoDuration: body.videoDuration,
          videoWidth: body.videoWidth,
          videoHeight: body.videoHeight,
          designData: body.designData,
          progress: 0,
          creditsDeducted: false,
          creditsUsed: 10,
          generationId: createdGeneration.id,
        },
      })

      const updatedFieldValues = {
        ...baseFieldValues,
        originalJobId: createdJob.id,
        generationId: createdGeneration.id,
      }

      const updatedGeneration = await tx.generation.update({
        where: { id: createdGeneration.id },
        data: {
          fieldValues: updatedFieldValues,
        },
      })

      return { job: createdJob, generation: updatedGeneration }
    })

    console.log('[Queue Video] Job criado com sucesso:', job.id)

    // 6. Retornar ID do job para polling
    return NextResponse.json({
      success: true,
      jobId: job.id,
      generationId: generation.id,
      thumbnailUrl,
      message: 'Vídeo adicionado à fila de processamento',
    })
  } catch (error) {
    console.error('[Queue Video] Erro ao enfileirar vídeo:', error)

    if (error instanceof Error && error.message.includes('créditos insuficientes')) {
      return NextResponse.json(
        { error: 'Créditos insuficientes para processar vídeo' },
        { status: 402 }
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
