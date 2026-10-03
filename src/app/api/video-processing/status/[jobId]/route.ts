import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { lerVideoDaPagina } from '@/lib/video/destino-do-video'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId } = await params

  try {
    const job = await db.videoProcessingJob.findUnique({
      where: { id: jobId },
      include: { generation: { select: { fieldValues: true } } },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Verificar se o job pertence ao usuário
    if (job.clerkUserId !== clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      mp4ResultUrl: job.mp4ResultUrl,
      thumbnailUrl: job.thumbnailUrl,
      generationId: job.generationId,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      // Para onde o vídeo foi: o post criado na agenda, ou o desfecho da substituição.
      destino: (() => {
        const v = lerVideoDaPagina(job.generation?.fieldValues)
        return v ? { tipo: v.destino.tipo, postId: v.postId ?? null, aviso: v.aviso ?? null, resultado: v.resultado ?? null } : null
      })(),
    })
  } catch (error) {
    console.error('[Get Job Status] Erro:', error)
    return NextResponse.json({ error: 'Failed to get job status' }, { status: 500 })
  }
}
