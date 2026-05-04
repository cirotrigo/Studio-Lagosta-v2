import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '../../../../prisma/generated/client'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { WEEKDAY_TIMEZONE } from '@/lib/weekday-options'

export const runtime = 'nodejs'

function parseWeekdays(raw: string | null): number[] | null {
  if (!raw) return null
  const parsed = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return parsed.length > 0 ? Array.from(new Set(parsed)) : null
}

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
    const weekdays = parseWeekdays(url.searchParams.get('weekdays'))

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

    // Filtro por dia da semana via raw SQL: COALESCE(MAX(SocialPost.sentAt), Generation.createdAt)
    // convertido pra America/Sao_Paulo. Restringe aos accessibleProjectIds (segurança).
    let weekdayFilteredIds: string[] | null = null
    let weekdayTotal: number | null = null
    if (weekdays && weekdays.length < 7) {
      const projectIdScope: number[] =
        typeof generationWhere.projectId === 'number'
          ? [generationWhere.projectId]
          : accessibleProjectIds

      const totalRows = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Generation" g
        LEFT JOIN LATERAL (
          SELECT MAX(sp."sentAt") AS last_sent
          FROM "SocialPost" sp
          WHERE sp."generationId" = g.id AND sp."sentAt" IS NOT NULL
        ) sp_meta ON TRUE
        WHERE g."projectId" IN (${Prisma.join(projectIdScope)})
          AND EXTRACT(DOW FROM (COALESCE(sp_meta.last_sent, g."createdAt") AT TIME ZONE ${WEEKDAY_TIMEZONE}))::int IN (${Prisma.join(weekdays)})
      `
      weekdayTotal = Number(totalRows[0]?.count ?? 0)

      const idRows = await db.$queryRaw<Array<{ id: string }>>`
        SELECT g.id
        FROM "Generation" g
        LEFT JOIN LATERAL (
          SELECT MAX(sp."sentAt") AS last_sent
          FROM "SocialPost" sp
          WHERE sp."generationId" = g.id AND sp."sentAt" IS NOT NULL
        ) sp_meta ON TRUE
        WHERE g."projectId" IN (${Prisma.join(projectIdScope)})
          AND EXTRACT(DOW FROM (COALESCE(sp_meta.last_sent, g."createdAt") AT TIME ZONE ${WEEKDAY_TIMEZONE}))::int IN (${Prisma.join(weekdays)})
        ORDER BY g."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `
      weekdayFilteredIds = idRows.map((r) => r.id)
      generationWhere.id = { in: weekdayFilteredIds }
    }

    // Fetch total count
    const total = weekdayTotal ?? (await db.generation.count({ where: generationWhere }))

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
      skip: weekdayFilteredIds ? undefined : (page - 1) * pageSize,
      take: weekdayFilteredIds ? undefined : pageSize,
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
