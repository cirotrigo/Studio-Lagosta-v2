import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess } from '@/lib/projects/access'

// Export runtime to ensure proper handling
export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    console.log('[GENERATIONS API] Route handler called')
    const { projectId: projectIdParam } = await params
    console.log('[GENERATIONS API] ProjectId from params:', projectIdParam)

    const { userId: clerkUserId, orgId } = await auth()
    console.log('[GENERATIONS API] Clerk userId:', clerkUserId, 'orgId:', orgId)

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    console.log('[GENERATIONS API] DB user:', user.id)
    const projectId = parseInt(projectIdParam)
    console.log('[GENERATIONS API] Parsed projectId:', projectId)

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

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasProjectReadAccess(project, { userId: clerkUserId, orgId })) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse pagination params
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = parseInt(url.searchParams.get('pageSize') || '100', 10)
    const createdByFilter = url.searchParams.get('createdBy')

    // Build where clause
    const where: any = { projectId }
    if (createdByFilter) {
      where.createdBy = createdByFilter
    }

    // Fetch total count
    const total = await db.generation.count({ where })

    // Fetch generations for this project with pagination
    const generations = await db.generation.findMany({
      where,
      select: {
        id: true,
        status: true,
        templateId: true,
        fieldValues: true,
        resultUrl: true,
        googleDriveFileId: true,
        googleDriveBackupUrl: true,
        projectId: true,
        templateName: true,
        projectName: true,
        createdBy: true,
        createdAt: true,
        completedAt: true,
        Template: {
          select: {
            id: true,
            name: true,
            type: true,
            dimensions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({
      generations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error fetching generations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
