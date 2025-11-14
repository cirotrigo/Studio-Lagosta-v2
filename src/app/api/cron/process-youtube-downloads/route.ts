import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkYoutubeDownloadStatus } from '@/lib/youtube/video-download-client'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      console.warn('[CRON] Unauthorized attempt to access process-youtube-downloads')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[CRON] Processing YouTube download queue...')

    const downloadingJobs = await db.youtubeDownloadJob.findMany({
      where: { status: 'downloading' },
      orderBy: { createdAt: 'asc' },
    })

    for (const job of downloadingJobs) {
      try {
        await checkYoutubeDownloadStatus(job.id)
      } catch (error) {
        console.error(`[CRON] Failed to update job ${job.id}:`, error)
      }
    }

    if (downloadingJobs.length === 0) {
      const nextJob = await db.youtubeDownloadJob.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      })

      if (nextJob) {
        console.log('[CRON] Starting next YouTube download job:', nextJob.id)
        try {
          await checkYoutubeDownloadStatus(nextJob.id)
        } catch (error) {
          console.error(`[CRON] Failed to start job ${nextJob.id}:`, error)
        }
      } else {
        console.log('[CRON] No pending YouTube downloads')
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
      processing: downloadingJobs.length,
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
