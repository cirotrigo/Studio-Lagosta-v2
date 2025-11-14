/**
 * GET /api/biblioteca-musicas/:id/stem-status
 * Returns the status of stem processing for a music track
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid music ID' }, { status: 400 })
    }

    const music = await db.musicLibrary.findUnique({
      where: { id },
      include: { stemJob: true },
    })

    if (!music) {
      return NextResponse.json({ error: 'Music not found' }, { status: 404 })
    }

    return NextResponse.json({
      musicId: music.id,
      hasPercussionStem: music.hasPercussionStem,
      percussionUrl: music.percussionUrl,
      stemsProcessedAt: music.stemsProcessedAt,
      job: music.stemJob
        ? {
            id: music.stemJob.id,
            status: music.stemJob.status,
            progress: music.stemJob.progress,
            mvsepStatus: music.stemJob.mvsepStatus,
            error: music.stemJob.error,
            createdAt: music.stemJob.createdAt,
            startedAt: music.stemJob.startedAt,
            completedAt: music.stemJob.completedAt,
          }
        : null,
    })
  } catch (error) {
    console.error('[API] Error fetching stem status:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
