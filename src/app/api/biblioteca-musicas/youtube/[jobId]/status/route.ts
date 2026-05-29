import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refreshPendingYoutubeJob } from '@/lib/youtube/video-download-client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId: jobIdStr } = await params
    const jobId = Number(jobIdStr)
    if (!jobId || Number.isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
    }

    let job = await getJob(jobId)

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.createdBy && job.createdBy !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (job.status === 'pending' && job.videoApiStatus === 'processing') {
      try {
        await refreshPendingYoutubeJob(job.id)
        job = await getJob(jobId)
        if (!job) {
          return NextResponse.json({ error: 'Job not found' }, { status: 404 })
        }
      } catch (error) {
        console.error('[YOUTUBE] Failed to refresh pending job', job.id, error)
      }
    }

    return NextResponse.json(formatJobResponse(job))
  } catch (error) {
    console.error('[YOUTUBE] Status error:', error)
    return NextResponse.json({ error: 'Failed to load job status' }, { status: 500 })
  }
}

type JobWithRelations = Awaited<ReturnType<typeof getJob>>

function formatJobResponse(job: NonNullable<JobWithRelations>) {
  const downloadLink =
    job.status === 'downloading' && job.videoApiJobId?.startsWith('http')
      ? job.videoApiJobId
      : null

  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    youtubeUrl: job.youtubeUrl,
    title: job.title,
    thumbnail: job.thumbnail,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    videoApiStatus: job.videoApiStatus,
    downloadLink,
    music: job.music
      ? {
          id: job.music.id,
          name: job.music.name,
          blobUrl: job.music.blobUrl,
          hasInstrumentalStem: job.music.hasInstrumentalStem,
          instrumentalUrl: job.music.instrumentalUrl,
          stemJob: job.music.stemJob
            ? {
                status: job.music.stemJob.status,
                progress: job.music.stemJob.progress,
              }
            : null,
        }
      : null,
  }
}

function getJob(jobId: number) {
  return db.youtubeDownloadJob.findUnique({
    where: { id: jobId },
    include: {
      music: {
        include: {
          stemJob: true,
        },
      },
    },
  })
}
