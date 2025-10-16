import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    console.log('[CREATIVES API] Route handler called')
    const { projectId: projectIdParam } = await params
    console.log('[CREATIVES API] ProjectId from params:', projectIdParam)

    const { userId: clerkUserId } = await auth()
    console.log('[CREATIVES API] Clerk userId:', clerkUserId)

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    console.log('[CREATIVES API] DB user:', user.id)
    const projectId = parseInt(projectIdParam)
    console.log('[CREATIVES API] Parsed projectId:', projectId)

    // Verify project ownership - use clerkUserId, not user.id
    console.log('[CREATIVES API] Looking for project with id:', projectId, 'and userId:', clerkUserId)

    const project = await db.project.findFirst({
      where: { id: projectId, userId: clerkUserId },
    })

    console.log('[CREATIVES API] Project found:', project ? 'YES' : 'NO')

    // Also check if project exists without userId filter
    const projectExists = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, name: true }
    })
    console.log('[CREATIVES API] Project exists (any user):', projectExists)

    if (!project) {
      console.log('[CREATIVES API] Project not found for this user - returning 404')
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    console.log('[CREATIVES API] Fetching generations for project:', projectId)

    // Fetch generations for this project
    const generations = await db.generation.findMany({
      where: {
        projectId: projectId,
      },
      select: {
        id: true,
        templateName: true,
        resultUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log('[CREATIVES API] Found generations:', generations.length)

    return NextResponse.json(generations)
  } catch (error) {
    console.error('[CREATIVES API] Error fetching generations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
