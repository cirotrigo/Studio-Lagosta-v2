/**
 * ADMIN: Reprocessar todos os jobs que falharam
 * GET /api/admin/retry-all-failed
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    // Buscar todos os jobs com erro
    const failedJobs = await db.musicStemJob.findMany({
      where: { status: 'failed' },
    })

    console.log(`[RETRY] Found ${failedJobs.length} failed jobs`)

    // Resetar todos para pending
    const result = await db.musicStemJob.updateMany({
      where: { status: 'failed' },
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

    console.log(`[RETRY] Reset ${result.count} jobs to pending`)

    return NextResponse.json({
      success: true,
      message: `${result.count} jobs reset to pending`,
      jobsReset: result.count,
      note: 'Jobs will be processed by the next cron run (in ~2 minutes)',
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
