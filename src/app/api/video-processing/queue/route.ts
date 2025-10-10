import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { validateCreditsForFeature } from '@/lib/credits/deduct'
import { put } from '@vercel/blob'

const queueVideoSchema = z.object({
  templateId: z.number(),
  projectId: z.number(),
  videoName: z.string(),
  videoDuration: z.number().positive(),
  videoWidth: z.number().positive(),
  videoHeight: z.number().positive(),
  webmBlob: z.string(), // Base64 encoded WebM video
  designData: z.any(), // Template design data
})

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

    // 3. Decodificar base64 e converter para Blob
    const base64Data = body.webmBlob.split(',')[1] || body.webmBlob
    const binaryData = Buffer.from(base64Data, 'base64')

    // 4. Upload do WebM para Vercel Blob Storage
    console.log('[Queue Video] Fazendo upload do WebM para Vercel Blob...')
    const webmFilename = `video-processing/${clerkUserId}/${Date.now()}-${body.videoName}.webm`

    const { url: webmBlobUrl } = await put(webmFilename, binaryData, {
      access: 'public',
      contentType: 'video/webm',
    })

    console.log('[Queue Video] WebM uploaded:', webmBlobUrl)

    // 5. Criar job na fila
    const job = await db.videoProcessingJob.create({
      data: {
        userId: user.id,
        clerkUserId,
        templateId: body.templateId,
        projectId: body.projectId,
        status: 'PENDING',
        webmBlobUrl,
        webmFileSize: binaryData.length,
        videoName: body.videoName,
        videoDuration: body.videoDuration,
        videoWidth: body.videoWidth,
        videoHeight: body.videoHeight,
        designData: body.designData,
        progress: 0,
        creditsDeducted: false,
        creditsUsed: 10,
      },
    })

    console.log('[Queue Video] Job criado com sucesso:', job.id)

    // 6. Retornar ID do job para polling
    return NextResponse.json({
      success: true,
      jobId: job.id,
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
