import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  checkYoutubeDownloadStatus,
  refreshPendingYoutubeJob,
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

    // Descarta o que passou de 2 horas em "downloading".
    //
    // Esse estado só avança pelo NAVEGADOR (o CDN recusa IP de datacenter), e o
    // link que o CDN assina vale ~2h — então, passado esse prazo, não há mais o
    // que recuperar nem daqui nem da página. A mensagem precisa dizer isso: a
    // anterior ("job stuck for more than 2 hours") aparecia para o usuário sem
    // explicar a causa nem o que fazer.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const stuckJobs = await db.youtubeDownloadJob.updateMany({
      where: {
        status: 'downloading',
        startedAt: { lt: twoHoursAgo },
      },
      data: {
        status: 'failed',
        error:
          'O arquivo não chegou a ser baixado e o link expirou. O download acontece pela página da biblioteca de músicas, que precisa ficar aberta até o fim — envie o link do YouTube de novo.',
      },
    })

    if (stuckJobs.count > 0) {
      console.log(`[CRON] Cleaned ${stuckJobs.count} stuck download jobs`)
    }

    // Reconsulta jobs pendentes (RapidAPI ainda convertendo) — pode virar
    // "downloading" com link. O download em si é feito pelo navegador do usuário.
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

    // Limpa jobs antigos "downloading" sem link (nunca ficaram prontos).
    const downloadingJobs = await db.youtubeDownloadJob.findMany({
      where: { status: 'downloading', videoApiJobId: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
    for (const job of downloadingJobs) {
      try {
        await checkYoutubeDownloadStatus(job.id)
      } catch (error) {
        console.error(`[CRON] Failed to update job ${job.id}:`, error)
      }
    }

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
      downloading: downloadingJobs.length,
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
