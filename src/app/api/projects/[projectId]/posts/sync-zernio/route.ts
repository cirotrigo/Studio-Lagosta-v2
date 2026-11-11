/**
 * Manual sync endpoint: import posts from Zernio into local DB for a specific project
 * POST /api/projects/{projectId}/posts/sync-zernio
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { sincronizarZernio } from '@/lib/posts/sync-zernio'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { projectId } = await params
    const projectIdNum = parseInt(projectId)

    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId: user.id },
      select: { id: true, laterAccountId: true, userId: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.laterAccountId) {
      return NextResponse.json({ error: 'Zernio account not configured for this project' }, { status: 400 })
    }

    const sync = await sincronizarZernio({
      projects: [project],
      statuses: ['draft', 'scheduled'],
      accountId: project.laterAccountId,
    })

    return NextResponse.json({ success: true, sync })
  } catch (error) {
    console.error('[Sync Zernio] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
