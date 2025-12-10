/**
 * Test Endpoint: Process Music Stems (Development Only)
 *
 * Este endpoint permite testar o processamento de stems em desenvolvimento.
 * Em produção, use o Vercel Cron que chama /api/cron/process-music-stems
 *
 * Para testar:
 * 1. Abra o navegador
 * 2. Acesse: http://localhost:3000/api/cron/test-process-stems
 * 3. Ou use: curl http://localhost:3000/api/cron/test-process-stems
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { startStemSeparation, checkMvsepJobStatus } from '@/lib/mvsep/mvsep-client'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes

export async function GET(_req: NextRequest) {
  try {
    // Apenas em desenvolvimento
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'This endpoint is only available in development. Use the cron job instead.' },
        { status: 403 }
      )
    }

    console.log('[TEST] Starting manual music stem processing...')

    // 1. Listar todos os jobs pendentes e em processamento para debug
    const allJobs = await db.musicStemJob.findMany({
      where: {
        status: {
          in: ['pending', 'processing'],
        },
      },
      include: { music: true },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`[TEST] Found ${allJobs.length} jobs in queue`)
    allJobs.forEach((job) => {
      console.log(`[TEST] Job ${job.id}: status=${job.status}, progress=${job.progress}%, music="${job.music.name}"`)
    })

    // 2. Verificar se já tem job em processamento
    const processingJob = await db.musicStemJob.findFirst({
      where: { status: 'processing' },
      include: { music: true },
    })

    if (processingJob) {
      console.log(`[TEST] Found processing job ${processingJob.id}, checking status...`)
      await checkMvsepJobStatus(processingJob)

      // Buscar status atualizado
      const updatedJob = await db.musicStemJob.findUnique({
        where: { id: processingJob.id },
        include: { music: true },
      })

      return NextResponse.json({
        message: 'Job already processing',
        jobId: processingJob.id,
        musicId: processingJob.musicId,
        musicName: processingJob.music.name,
        currentStatus: updatedJob?.status,
        progress: updatedJob?.progress,
        mvsepStatus: updatedJob?.mvsepStatus,
        mvsepJobHash: updatedJob?.mvsepJobHash,
      })
    }

    // 3. Buscar próximo job pendente
    const nextJob = await db.musicStemJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { music: true },
    })

    if (!nextJob) {
      console.log('[TEST] No pending jobs found')
      return NextResponse.json({
        message: 'No pending jobs',
        totalJobs: allJobs.length,
        jobs: allJobs.map((j) => ({
          id: j.id,
          musicId: j.musicId,
          musicName: j.music.name,
          status: j.status,
          progress: j.progress,
        })),
      })
    }

    // 4. Iniciar processamento
    console.log(`[TEST] Starting job ${nextJob.id} for music "${nextJob.music.name}"`)
    await startStemSeparation(nextJob)

    // Buscar status atualizado
    const updatedJob = await db.musicStemJob.findUnique({
      where: { id: nextJob.id },
      include: { music: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Job started successfully',
      jobId: nextJob.id,
      musicId: nextJob.musicId,
      musicName: nextJob.music.name,
      currentStatus: updatedJob?.status,
      progress: updatedJob?.progress,
      mvsepJobHash: updatedJob?.mvsepJobHash,
      mvsepStatus: updatedJob?.mvsepStatus,
      note: 'Refresh this page in a few seconds to check progress',
    })
  } catch (error) {
    console.error('[TEST] Error processing music stems:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
