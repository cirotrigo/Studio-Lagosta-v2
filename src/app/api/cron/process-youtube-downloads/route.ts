import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  checkYoutubeDownloadStatus,
  refreshPendingYoutubeJob,
  downloadAndIngestYoutubeJob,
} from '@/lib/youtube/video-download-client'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      console.warn('[CRON] Unauthorized attempt to access process-youtube-downloads')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[CRON] Processing YouTube download queue...')

    // Limpar jobs stuck que estão downloading há mais de 2 horas
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const stuckJobs = await db.youtubeDownloadJob.updateMany({
      where: {
        status: 'downloading',
        startedAt: { lt: twoHoursAgo },
      },
      data: {
        status: 'failed',
        error: 'Download timeout - job stuck for more than 2 hours',
      },
    })

    if (stuckJobs.count > 0) {
      console.log(`[CRON] Cleaned ${stuckJobs.count} stuck download jobs`)
    }

    // Reseta jobs travados em "uploading" (crash/timeout no meio da ingestão)
    // de volta para "downloading" para que possam ser rebaixados abaixo.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
    const stalledUploads = await db.youtubeDownloadJob.updateMany({
      where: {
        status: 'uploading',
        musicId: null,
        startedAt: { lt: tenMinAgo },
      },
      data: { status: 'downloading', progress: 50 },
    })
    if (stalledUploads.count > 0) {
      console.log(`[CRON] Reset ${stalledUploads.count} stalled uploads to downloading`)
    }

    // Reconsulta jobs pendentes (RapidAPI ainda convertendo) — pode virar "downloading".
    const pendingJobs = await db.youtubeDownloadJob.findMany({
      where: { status: 'pending', videoApiStatus: 'processing' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
    for (const job of pendingJobs) {
      try {
        await refreshPendingYoutubeJob(job.id)
      } catch (error) {
        console.error(`[CRON] Failed to refresh pending job ${job.id}:`, error)
      }
    }

    // Baixa (server-side) e cadastra os jobs prontos: status "downloading",
    // com link e sem música ainda. Esse é o fallback do fluxo automático.
    const readyJobs = await db.youtubeDownloadJob.findMany({
      where: { status: 'downloading', musicId: null },
      orderBy: { createdAt: 'asc' },
      take: 10,
    })

    let ingested = 0
    for (const job of readyJobs) {
      if (job.videoApiJobId?.startsWith('http')) {
        try {
          await downloadAndIngestYoutubeJob(job.id)
          ingested++
        } catch (error) {
          console.error(`[CRON] Failed to ingest job ${job.id}:`, error)
        }
      } else {
        // Sem link ainda — mantém compatibilidade com o handler antigo (timeout).
        try {
          await checkYoutubeDownloadStatus(job.id)
        } catch (error) {
          console.error(`[CRON] Failed to update job ${job.id}:`, error)
        }
      }
    }
    console.log(`[CRON] Ingested ${ingested}/${readyJobs.length} ready jobs`)

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const deleted = await db.youtubeDownloadJob.deleteMany({
      where: {
        status: 'failed',
        musicId: null,
        createdAt: { lt: cutoff },
      },
    })

    return NextResponse.json({
      success: true,
      pending: pendingJobs.length,
      ready: readyJobs.length,
      ingested,
      cleaned: deleted.count,
    })
  } catch (error) {
    console.error('[CRON] Error while processing YouTube downloads:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const { searchParams } = new URL(req.url)
  const secretParam = searchParams.get('secret')

  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  const expectedSecret = process.env.CRON_SECRET

  return (
    authHeader === expectedAuth ||
    secretParam === expectedSecret ||
    req.headers.get('x-vercel-cron') === '1'
  )
}
