/**
 * Cron job for Zernio → DB sync
 * Imports posts created externally (via Zernio dashboard/MCP) into local DB,
 * drafts included (they show up in the agenda as drafts awaiting approval)
 * Runs every 10 minutes
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sincronizarZernio } from '@/lib/posts/sync-zernio'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron Sync Zernio] Starting sync...')

    // Find all projects with laterAccountId configured
    const projects = await db.project.findMany({
      where: { laterAccountId: { not: null } },
      select: { id: true, laterAccountId: true, userId: true },
    })

    if (projects.length === 0) {
      return NextResponse.json({ success: true, message: 'No projects with Zernio configured' })
    }

    // `draft` primeiro: o post que virar agendado no meio da rodada fica com o estado mais novo.
    const result = await sincronizarZernio({ projects, statuses: ['draft', 'scheduled', 'published'] })
    console.log('[Cron Sync Zernio] Complete:', result)

    return NextResponse.json({ success: true, sync: result })
  } catch (error) {
    console.error('[Cron Sync Zernio] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
