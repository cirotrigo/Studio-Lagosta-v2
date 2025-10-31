import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    console.log('[CREATIVES API] Route handler called')
    const { projectId: projectIdParam } = await params
    console.log('[CREATIVES API] ProjectId from params:', projectIdParam)

    const { userId: clerkUserId, orgId } = await auth()
    console.log('[CREATIVES API] Clerk userId:', clerkUserId, 'orgId:', orgId)

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    console.log('[CREATIVES API] DB user:', user.id)
    const projectId = parseInt(projectIdParam)
    console.log('[CREATIVES API] Parsed projectId:', projectId)

    // Verificar acesso ao projeto (dono ou membro da organização)
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: {
                clerkOrgId: true,
                name: true,
              },
            },
          },
        },
      },
    })

    console.log('[CREATIVES API] Project found:', project ? 'YES' : 'NO')

    if (!project) {
      console.log('[CREATIVES API] Project not found - returning 404')
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasProjectReadAccess(project, { userId: clerkUserId, orgId })) {
      console.log('[CREATIVES API] User does not have access - returning 403')
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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
        VideoProcessingJob: {
          select: {
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log('[CREATIVES API] Found generations:', generations.length)

    // Map generations to include thumbnailUrl from VideoProcessingJob if available
    const generationsWithThumbnails = generations.map((gen) => ({
      id: gen.id,
      templateName: gen.templateName,
      resultUrl: gen.resultUrl,
      thumbnailUrl: gen.VideoProcessingJob?.thumbnailUrl || null,
      createdAt: gen.createdAt,
    }))

    return NextResponse.json(generationsWithThumbnails)
  } catch (error) {
    console.error('[CREATIVES API] Error fetching generations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
