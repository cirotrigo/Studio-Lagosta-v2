/**
 * Cron Job: Process Music Stems
 * Runs every 2 minutes to process pending stem separation jobs
 *
 * Security: Requires Bearer token (CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { startStemSeparation, checkMvsepJobStatus } from '@/lib/mvsep/mvsep-client'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes

export async function POST(req: NextRequest) {
  try {
    // Verificar autenticação do cron job
    const authHeader = req.headers.get('authorization')
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    if (authHeader !== expectedAuth) {
      console.warn('[CRON] Unauthorized attempt to access process-music-stems')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[CRON] Starting music stem processing job...')

    // 1. Verificar se já tem job em processamento (limite do plano gratuito)
    const processingJob = await db.musicStemJob.findFirst({
      where: { status: 'processing' },
      include: { music: true },
    })

    if (processingJob) {
      console.log(`[CRON] Found processing job ${processingJob.id}, checking status...`)
      // Verificar status do job em processamento no MVSEP
      await checkMvsepJobStatus(processingJob)

      return NextResponse.json({
        message: 'Job already processing',
        jobId: processingJob.id,
        musicId: processingJob.musicId,
        progress: processingJob.progress,
      })
    }

    // 2. Buscar próximo job pendente (FIFO)
    const nextJob = await db.musicStemJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { music: true },
    })

    if (!nextJob) {
      console.log('[CRON] No pending jobs found')
      return NextResponse.json({ message: 'No pending jobs' })
    }

    // 3. Iniciar processamento do próximo job
    console.log(`[CRON] Starting job ${nextJob.id} for music ${nextJob.musicId}`)
    await startStemSeparation(nextJob)

    return NextResponse.json({
      success: true,
      jobId: nextJob.id,
      musicId: nextJob.musicId,
      musicName: nextJob.music.name,
    })
  } catch (error) {
    console.error('[CRON] Error processing music stems:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
