/**
 * POST /api/biblioteca-musicas/:id/reprocess-stem
 * Reprocess stem separation for a music track (retry failed or create new job)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticação
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid music ID' }, { status: 400 })
    }

    // Verificar se música existe
    const music = await db.musicLibrary.findUnique({
      where: { id },
      include: { stemJob: true },
    })

    if (!music) {
      return NextResponse.json({ error: 'Music not found' }, { status: 404 })
    }

    // Resetar ou criar job
    if (music.stemJob) {
      console.log(`[API] Resetting stem job ${music.stemJob.id} for music ${music.id}`)

      await db.musicStemJob.update({
        where: { id: music.stemJob.id },
        data: {
          status: 'pending',
          progress: 0,
          error: null,
          mvsepJobHash: null,
          mvsepStatus: null,
          startedAt: null,
          completedAt: null,
        },
      })
    } else {
      console.log(`[API] Creating new stem job for music ${music.id}`)

      await db.musicStemJob.create({
        data: {
          musicId: music.id,
          status: 'pending',
          progress: 0,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Job requeued successfully',
      musicId: music.id,
    })
  } catch (error) {
    console.error('[API] Error reprocessing stem:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
