import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '../../../../prisma/generated/client'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)

    // Parse query params
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10)
    const projectIdFilter = url.searchParams.get('projectId')

    // Build list of accessible project IDs
    // 1. Projects owned by the user
    // 2. Projects shared with the user's organization
    const accessibleProjectsWhere: Prisma.ProjectWhereInput = {
      OR: [
        { userId: clerkUserId },
        ...(orgId
          ? [
              {
                organizationProjects: {
                  some: {
                    organization: {
                      clerkOrgId: orgId,
                    },
                  },
                },
              },
            ]
          : []),
      ],
    }

    // Get accessible projects with their logos
    const accessibleProjects = await db.project.findMany({
      where: accessibleProjectsWhere,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        Logo: {
          where: { isProjectLogo: true },
          select: { fileUrl: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })

    const accessibleProjectIds = accessibleProjects.map((p) => p.id)

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({
        generations: [],
        projects: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      })
    }

    // Build generation where clause
    const generationWhere: Prisma.GenerationWhereInput = {
      projectId: { in: accessibleProjectIds },
    }

    // Apply project filter if specified
    if (projectIdFilter) {
      const parsedProjectId = parseInt(projectIdFilter, 10)
      if (!Number.isNaN(parsedProjectId) && accessibleProjectIds.includes(parsedProjectId)) {
        generationWhere.projectId = parsedProjectId
      }
    }

    // Fetch total count
    const total = await db.generation.count({ where: generationWhere })

    // Fetch generations with project data
    const generations = await db.generation.findMany({
      where: generationWhere,
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
        Project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            Logo: {
              where: { isProjectLogo: true },
              select: { fileUrl: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    // Format projects for the carousel (with logo URL resolved)
    const projects = accessibleProjects.map((p) => ({
      id: p.id,
      name: p.name,
      logoUrl: p.Logo?.[0]?.fileUrl ?? p.logoUrl ?? null,
    }))

    return NextResponse.json({
      generations,
      projects,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('[GLOBAL GENERATIONS API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
