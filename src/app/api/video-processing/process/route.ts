import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { convertWebMToMP4ServerSide } from '@/lib/video/ffmpeg-server-converter'

/**
 * POST /api/video-processing/process
 * Processa o próximo job PENDING na fila (chamado por cron ou manualmente)
 *
 * IMPORTANTE: Esta API deve ser chamada por um cron job (ex: Vercel Cron)
 * ou manualmente para processar a fila de vídeos
 */
export async function POST(request: Request) {
  try {
    // 1. Buscar o próximo job PENDING (FIFO)
    const job = await db.videoProcessingJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    })

    if (!job) {
      return NextResponse.json({ message: 'No pending jobs' })
    }

    console.log('[Video Processor] Processando job:', job.id)

    // 2. Marcar job como PROCESSING
    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        progress: 10,
      },
    })

    try {
      // 3. Baixar WebM do Vercel Blob
      console.log('[Video Processor] Baixando WebM:', job.webmBlobUrl)
      const webmResponse = await fetch(job.webmBlobUrl)
      const webmArrayBuffer = await webmResponse.arrayBuffer()
      const webmBuffer = Buffer.from(webmArrayBuffer)

      // Atualizar progresso
      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: { progress: 20 },
      })

      console.log('[Video Processor] Convertendo WebM → MP4 com FFmpeg...')
      const { mp4Buffer, thumbnailBuffer } = await convertWebMToMP4ServerSide(
        webmBuffer,
        async (progress) => {
          const dbProgress = 20 + progress.percent * 0.6
          await db.videoProcessingJob.update({
            where: { id: job.id },
            data: { progress: Math.min(80, Math.round(dbProgress)) },
          })
        },
        {
          preset: 'fast',
          crf: 23,
          generateThumbnail: true,
        }
      )

      console.log('[Video Processor] Conversão concluída!')

      // 5. Upload do MP4 resultante
      console.log('[Video Processor] Upload do MP4...')
      const mp4Filename = `video-exports/${job.clerkUserId}/${Date.now()}-${job.videoName}.mp4`

      const { url: mp4Url } = await put(mp4Filename, mp4Buffer, {
        access: 'public',
        contentType: 'video/mp4',
      })

      let thumbnailUrl = mp4Url
      if (thumbnailBuffer) {
        console.log('[Video Processor] Upload da thumbnail...')
        const thumbnailFilename = `video-thumbnails/${job.clerkUserId}/${Date.now()}-${job.videoName}.jpg`
        const { url } = await put(thumbnailFilename, thumbnailBuffer, {
          access: 'public',
          contentType: 'image/jpeg',
        })
        thumbnailUrl = url
      }

      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: { progress: 85 },
      })

      // 6. Deduzir créditos se ainda não foram deduzidos
      if (!job.creditsDeducted) {
        console.log('[Video Processor] Deduzindo créditos...')
        await deductCreditsForFeature({
          clerkUserId: job.clerkUserId,
          feature: 'video_export',
          details: {
            jobId: job.id,
            videoName: job.videoName,
            duration: job.videoDuration,
          },
        })
      }

      // 7. Salvar como Generation (Creative) para aparecer na aba Criativos
      console.log('[Video Processor] Salvando como Creative...')

      const generation = await db.generation.create({
        data: {
          templateId: job.templateId,
          projectId: job.projectId,
          createdBy: job.clerkUserId,
          status: 'COMPLETED',
          resultUrl: mp4Url,
          fieldValues: {
            videoExport: true,
            originalJobId: job.id,
            isVideo: true,
            mimeType: 'video/mp4',
            thumbnailUrl,
          },
          templateName: job.videoName,
          completedAt: new Date(),
        },
      })

      console.log('[Video Processor] Creative criado:', generation.id)

      // 8. Marcar job como COMPLETED
      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          mp4ResultUrl: mp4Url,
          thumbnailUrl,
          progress: 100,
          completedAt: new Date(),
          creditsDeducted: true,
        },
      })

      console.log('[Video Processor] Job concluído:', job.id)

      return NextResponse.json({
        success: true,
        jobId: job.id,
        mp4Url,
        thumbnailUrl,
      })
    } catch (error) {
      // Marcar job como FAILED em caso de erro
      console.error('[Video Processor] Erro ao processar job:', error)

      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      return NextResponse.json(
        { error: 'Failed to process video', jobId: job.id },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[Video Processor] Erro geral:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
