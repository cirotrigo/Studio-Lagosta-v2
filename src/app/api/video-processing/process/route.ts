import { NextResponse } from 'next/server'
import { processNextVideoJob } from '@/lib/video/process-video-job'

export const runtime = 'nodejs'

async function processNextJob(): Promise<NextResponse> {
  try {
    const result = await processNextVideoJob()

    if (result.outcome === 'idle') {
      return NextResponse.json({ message: 'No pending jobs' })
    }

    if (result.outcome === 'failed') {
      return NextResponse.json(
        {
          error: 'Failed to process video',
          jobId: result.jobId,
          details: result.error,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      mp4Url: result.mp4Url,
      thumbnailUrl: result.thumbnailUrl,
    })
  } catch (error) {
    console.error('[Video Processor] Erro geral:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

export async function POST(_request: Request) {
  return processNextJob()
}

export async function GET() {
  return processNextJob()
}
