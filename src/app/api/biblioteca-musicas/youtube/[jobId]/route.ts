import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
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

    const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.createdBy && job.createdBy !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (job.status === 'completed') {
      return NextResponse.json({ error: 'Cannot cancel completed job' }, { status: 400 })
    }

    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: 'Cancelled by user',
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[YOUTUBE] Failed to cancel job:', error)
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 })
  }
}
