/**
 * DEBUG: Ver detalhes do último job com erro
 * GET /api/admin/debug-stem-job
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    // Buscar todos os jobs com erro
    const failedJobs = await db.musicStemJob.findMany({
      where: { status: 'failed' },
      include: { music: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })

    // Buscar todos os jobs em processamento
    const processingJobs = await db.musicStemJob.findMany({
      where: { status: 'processing' },
      include: { music: true },
      orderBy: { updatedAt: 'desc' },
    })

    // Buscar todos os jobs pendentes
    const pendingJobs = await db.musicStemJob.findMany({
      where: { status: 'pending' },
      include: { music: true },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      summary: {
        failed: failedJobs.length,
        processing: processingJobs.length,
        pending: pendingJobs.length,
      },
      failedJobs: failedJobs.map((job) => ({
        id: job.id,
        musicId: job.musicId,
        musicName: job.music.name,
        status: job.status,
        progress: job.progress,
        error: job.error,
        mvsepJobHash: job.mvsepJobHash,
        mvsepStatus: job.mvsepStatus,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
      })),
      processingJobs: processingJobs.map((job) => ({
        id: job.id,
        musicId: job.musicId,
        musicName: job.music.name,
        progress: job.progress,
        mvsepJobHash: job.mvsepJobHash,
        mvsepStatus: job.mvsepStatus,
      })),
      pendingJobs: pendingJobs.map((job) => ({
        id: job.id,
        musicId: job.musicId,
        musicName: job.music.name,
        createdAt: job.createdAt,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
