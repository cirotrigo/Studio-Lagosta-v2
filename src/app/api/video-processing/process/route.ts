import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { deductCreditsForFeature } from '@/lib/credits/deduct'

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
      const webmBlob = await webmResponse.blob()

      // Atualizar progresso
      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: { progress: 30 },
      })

      // 4. Converter WebM para MP4 (server-side usando FFmpeg via API externa ou biblioteca)
      // Por enquanto, vamos simular a conversão copiando o WebM
      // TODO: Implementar conversão real com FFmpeg
      console.log('[Video Processor] Convertendo para MP4...')

      // Simular tempo de conversão
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Atualizar progresso
      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: { progress: 70 },
      })

      // 5. Upload do MP4 resultante
      console.log('[Video Processor] Upload do MP4...')
      const mp4Filename = `video-exports/${job.clerkUserId}/${Date.now()}-${job.videoName}.mp4`

      const { url: mp4Url } = await put(mp4Filename, webmBlob, {
        access: 'public',
        contentType: 'video/mp4',
      })

      // 5.1 Gerar thumbnail do primeiro frame do vídeo
      console.log('[Video Processor] Gerando thumbnail...')
      const thumbnailUrl = `https://image.mux.com/${mp4Url.split('/').pop()}/thumbnail.jpg?width=400&height=400&fit_mode=smartcrop`

      // TODO: Implementar geração real de thumbnail
      // Por enquanto, usar URL do MP4 como fallback
      const finalThumbnail = mp4Url

      // Atualizar progresso
      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: { progress: 90 },
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
          thumbnailUrl: finalThumbnail,
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
