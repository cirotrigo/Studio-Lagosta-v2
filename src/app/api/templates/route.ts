import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/prisma-types'
import { hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(Math.max(Math.floor(parsed), 1), 100)
}

/**
 * GET /api/templates
 * Lista templates do usuário ou templates públicos
 *
 * Query params:
 * - projectId: filtrar por projeto
 * - category: filtrar por categoria
 * - search: busca por nome ou dimensões
 * - includeDesign: incluir designData na resposta
 * - limit: limite de resultados (1-100)
 * - publicOnly: buscar apenas templates públicos
 */
export async function GET(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const url = new URL(req.url)
  const searchParams = url.searchParams

  const projectIdParam = searchParams.get('projectId')
  const categoryParam = searchParams.get('category')
  const searchParam = searchParams.get('search')?.trim() ?? ''
  const includeDesign = searchParams.get('includeDesign') === 'true'
  const limit = parseLimit(searchParams.get('limit'))
  const publicOnly = searchParams.get('publicOnly') === 'true'

  let projectId: number | undefined
  if (projectIdParam) {
    const parsed = Number(projectIdParam)
    if (!Number.isFinite(parsed)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    // Verificar se o usuário tem acesso ao projeto (dono ou membro da organização)
    const project = await db.project.findFirst({
      where: {
        id: parsed,
        OR: [
          { userId },
          ...(orgId ? [{
            organizationProjects: {
              some: {
                organization: {
                  clerkOrgId: orgId
                }
              }
            }
          }] : [])
        ]
      }
    })
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }
    projectId = parsed
  }

  // Construir filtro para templates: públicos OU de projetos que o usuário tem acesso
  const where: Prisma.TemplateWhereInput = publicOnly
    ? { isPublic: true }
    : {
        Project: {
          OR: [
            { userId },
            ...(orgId ? [{
              organizationProjects: {
                some: {
                  organization: {
                    clerkOrgId: orgId
                  }
                }
              }
            }] : [])
          ]
        }
      }

  if (typeof projectId === 'number') {
    where.projectId = projectId
  }

  if (categoryParam && categoryParam !== 'all') {
    where.category = categoryParam
  }

  if (searchParam) {
    where.OR = [
      { name: { contains: searchParam, mode: 'insensitive' } },
      { dimensions: { contains: searchParam, mode: 'insensitive' } },
      { tags: { has: searchParam } },
    ]
  }

  const select = includeDesign
    ? undefined
    : {
        id: true,
        name: true,
        type: true,
        dimensions: true,
        thumbnailUrl: true,
        category: true,
        tags: true,
        isPublic: true,
        isPremium: true,
        projectId: true,
        updatedAt: true,
        createdAt: true,
      }

  const templates = await db.template.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    ...(limit ? { take: limit } : {}),
    ...(select ? { select } : {}),
  })

  return NextResponse.json(templates)
}

/**
 * POST /api/templates
 * Cria um novo template
 */
export async function POST(req: Request) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, type, dimensions, designData, dynamicFields, thumbnailUrl, category, tags, isPublic, isPremium, projectId } = body

    if (!name || !type || !dimensions || !designData || !projectId) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    // Verificar se o usuário tem permissão de escrita no projeto
    const project = await db.project.findFirst({
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
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const template = await db.template.create({
      data: {
        name,
        type,
        dimensions,
        designData,
        dynamicFields: dynamicFields ?? [],
        thumbnailUrl,
        category,
        tags: tags ?? [],
        isPublic: isPublic ?? false,
        isPremium: isPremium ?? false,
        projectId,
        createdBy: userId,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Error creating template:', error)
    return NextResponse.json({ error: 'Erro ao criar template' }, { status: 500 })
  }
}
