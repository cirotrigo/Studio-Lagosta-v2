import { ehOrigemDoFiltro } from '@/lib/creatives/canal'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '../../../../../../prisma/generated/client'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { hasProjectReadAccess, withProjectOwner } from '@/lib/projects/access'

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

    if (!hasProjectReadAccess(await withProjectOwner(project), { userId: clerkUserId, orgId })) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse pagination params
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = parseInt(url.searchParams.get('pageSize') || '100', 10)
    const createdByFilter = url.searchParams.get('createdBy')
    const weekdays = parseWeekdays(url.searchParams.get('weekdays'))
    /**
     * Origem da arte (03/09/2026): por qual CANAL ela entrou, ou "melhorada
     * com IA". Valor desconhecido é ignorado, nunca erro — filtro é
     * conveniência. `studio` inclui o histórico sem canal (nulo), porque a
     * arte feita no app nunca gravou canal antes desta coluna existir.
     */
    const origemBruta = url.searchParams.get('origem')
    const origem = ehOrigemDoFiltro(origemBruta) ? origemBruta : null

    // Build where clause
    const where: Prisma.GenerationWhereInput = { projectId }
    if (createdByFilter) {
      where.createdBy = createdByFilter
    }
    if (origem === 'melhoria') {
      where.sourceGenerationId = { not: null }
    } else if (origem === 'studio') {
      where.OR = [{ canal: 'studio' }, { canal: null }]
    } else if (origem) {
      where.canal = origem
    }
    const origemSql =
      origem === 'melhoria'
        ? Prisma.sql`AND g."sourceGenerationId" IS NOT NULL`
        : origem === 'studio'
          ? Prisma.sql`AND (g.canal = 'studio' OR g.canal IS NULL)`
          : origem
            ? Prisma.sql`AND g.canal = ${origem}`
            : Prisma.empty

    // A galeria de Criativos mostra PEÇAS, não insumo: a trilha `imagem` gera
    // fotografia de cena, que vai para o acervo (Fotos/IA_LAGOSTA) e não é
    // uma arte para agendar. A Generation continua existindo — é o que faz
    // acompanhar, conferir e melhorar funcionarem —, só não é listada aqui.
    //
    // O filtro vai em SQL de propósito. O operador Json do Prisma
    // (`NOT { path: ['track'], equals: 'imagem' }`) descarta junto TODA linha
    // que não tem o campo — medido no projeto 7: devolvia 18 de 491, ou seja,
    // escondia 473 artes legítimas. COALESCE trata "sem track" como visível.
    const ocultas = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Generation"
      WHERE "projectId" = ${projectId}
        AND COALESCE("fieldValues"->>'track', '') = 'imagem'
    `
    const idsOcultos = ocultas.map((r) => r.id)

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
          ${origemSql}
          AND COALESCE(g."fieldValues"->>'track', '') <> 'imagem'
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
          ${origemSql}
          AND COALESCE(g."fieldValues"->>'track', '') <> 'imagem'
          AND EXTRACT(DOW FROM (COALESCE(sp_meta.last_sent, g."createdAt") AT TIME ZONE ${TIMEZONE}))::int IN (${Prisma.join(weekdays)})
        ORDER BY g."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `
      weekdayFilteredIds = idRows.map((r) => r.id)
      where.id = { in: weekdayFilteredIds }
    } else if (idsOcultos.length > 0) {
      // Fora do filtro de weekday (que já excluiu no próprio SQL), a exclusão
      // entra por id. Cresce com o acervo de fotos de IA: quando o `notIn`
      // ficar grande, o caminho é uma coluna espelho de `track`, no precedente
      // de `Generation.sourcePageId`.
      where.id = { notIn: idsOcultos }
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
        sourceGenerationId: true,
        // A estrela da galeria lê daqui — sem este campo ela nasceria apagada
        // a cada recarga, mesmo com a arte marcada no banco.
        styleRefAt: true,
        resultUrl: true,
        googleDriveFileId: true,
        googleDriveBackupUrl: true,
        projectId: true,
        templateName: true,
        projectName: true,
        createdBy: true,
        canal: true,
        authorName: true,
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
