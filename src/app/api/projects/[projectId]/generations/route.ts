import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '../../../../../../prisma/generated/client'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess } from '@/lib/projects/access'

// Export runtime to ensure proper handling
export const runtime = 'nodejs'

// Postgres EXTRACT(DOW) → 0 = Domingo, 6 = Sábado (mesma convenção que JS Date.getDay())
const TIMEZONE = 'America/Sao_Paulo'

function parseWeekdays(raw: string | null): number[] | null {
  if (!raw) return null
  const parsed = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return parsed.length > 0 ? Array.from(new Set(parsed)) : null
}

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
    const weekdays = parseWeekdays(url.searchParams.get('weekdays'))

    // Build where clause
    const where: Prisma.GenerationWhereInput = { projectId }
    if (createdByFilter) {
      where.createdBy = createdByFilter
    }

    // Filtro por dia da semana usa raw SQL pra calcular DOW em America/Sao_Paulo
    // sobre COALESCE(MAX(SocialPost.sentAt), Generation.createdAt).
    // Quando weekdays é setado, primeiro pegamos os IDs filtrados via raw, depois
    // o findMany normal mantém o select/relations com o id IN (...) extra.
    let weekdayFilteredIds: string[] | null = null
    let weekdayTotal: number | null = null
    if (weekdays && weekdays.length < 7) {
      // Total no projeto que bate com o filtro (sem paginação)
      const totalRows = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Generation" g
        LEFT JOIN LATERAL (
          SELECT MAX(sp."sentAt") AS last_sent
          FROM "SocialPost" sp
          WHERE sp."generationId" = g.id AND sp."sentAt" IS NOT NULL
        ) sp_meta ON TRUE
        WHERE g."projectId" = ${projectId}
          ${createdByFilter ? Prisma.sql`AND g."createdBy" = ${createdByFilter}` : Prisma.empty}
          AND EXTRACT(DOW FROM (COALESCE(sp_meta.last_sent, g."createdAt") AT TIME ZONE ${TIMEZONE}))::int IN (${Prisma.join(weekdays)})
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
        WHERE g."projectId" = ${projectId}
          ${createdByFilter ? Prisma.sql`AND g."createdBy" = ${createdByFilter}` : Prisma.empty}
          AND EXTRACT(DOW FROM (COALESCE(sp_meta.last_sent, g."createdAt") AT TIME ZONE ${TIMEZONE}))::int IN (${Prisma.join(weekdays)})
        ORDER BY g."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `
      weekdayFilteredIds = idRows.map((r) => r.id)
      where.id = { in: weekdayFilteredIds }
    }

    // Fetch total count (sem filtro de weekday usa o where padrão)
    const total = weekdayTotal ?? (await db.generation.count({ where }))

    // Fetch generations: quando filtramos por weekday, não aplicamos paginação aqui
    // porque o where.id já está limitado aos IDs corretos da página.
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
        fileName: true,
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
      skip: weekdayFilteredIds ? undefined : (page - 1) * pageSize,
      take: weekdayFilteredIds ? undefined : pageSize,
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
