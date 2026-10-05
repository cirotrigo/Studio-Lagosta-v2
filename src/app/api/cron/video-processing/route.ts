import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processNextVideoJob, recuperarJobsDeVideoPresos } from '@/lib/video/process-video-job'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Varredura da fila de vídeo (a cada 2 min).
 *
 * O disparo normal é o da própria rota da fila, em `after()`, logo depois do
 * enfileiramento — este cron é a rede: devolve à fila (ou conclui) o job preso
 * além do arrendamento e processa o PENDING esquecido, inclusive o devolvido
 * pela recuperação. Só pega PENDING com mais de 2 minutos para não disputar
 * com o disparo imediato (a reserva por compare-and-set impede o trabalho
 * dobrado de qualquer jeito).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const recuperacao = await recuperarJobsDeVideoPresos()

    const cutoff = new Date(Date.now() - 2 * 60 * 1000)
    const oldestPending = await db.videoProcessingJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true },
    })

    if (!oldestPending || (oldestPending.createdAt > cutoff && recuperacao.devolvidos === 0)) {
      return NextResponse.json({ success: true, recuperacao, processed: 0 })
    }

    console.log(`[cron video-processing] Job PENDING detectado (${oldestPending.id}) — processando`)
    const result = await processNextVideoJob()

    return NextResponse.json({
      success: true,
      recuperacao,
      processed: result.outcome === 'idle' ? 0 : 1,
      result,
    })
  } catch (error) {
    console.error('[cron video-processing] Erro:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
