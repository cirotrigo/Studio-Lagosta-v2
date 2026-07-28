import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  failStuckVideoJobs,
  processNextVideoJob,
} from '@/lib/video/process-video-job'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Varredura da fila de vídeo (a cada 2 min).
 *
 * O disparo normal é o fetch fire-and-forget do browser logo após o upload
 * (/api/video-processing/process) — este cron é a rede de segurança: pega jobs
 * PENDING órfãos (aba fechada antes do disparo) e mata jobs presos em
 * PROCESSING. Só processa PENDING com mais de 2 minutos de idade para não
 * disputar com o disparo imediato do browser.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stuckFailed = await failStuckVideoJobs()

    const cutoff = new Date(Date.now() - 2 * 60 * 1000)
    const oldestPending = await db.videoProcessingJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true },
    })

    if (!oldestPending || oldestPending.createdAt > cutoff) {
      return NextResponse.json({ success: true, stuckFailed, processed: 0 })
    }

    console.log(
      `[cron video-processing] Job PENDING órfão detectado (${oldestPending.id}) — processando`,
    )
    const result = await processNextVideoJob()

    return NextResponse.json({
      success: true,
      stuckFailed,
      processed: result.outcome === 'idle' ? 0 : 1,
      result,
    })
  } catch (error) {
    console.error('[cron video-processing] Erro:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
