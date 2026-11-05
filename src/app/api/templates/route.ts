import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ehMiniaturaEmbutida, guardarMiniatura } from '@/lib/templates/miniatura'
import type { Prisma } from '@/lib/prisma-types'
import { hasProjectWriteAccess, withProjectOwner } from '@/lib/projects/access'
import { VetorInvalido } from '@/lib/vetor/validar-camada'
import { corpoDoVetorInvalido, exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'
import { KONVA_PROJECT_EXPORT_CATEGORY } from '@/lib/konva-project-creatives'

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

  if (!publicOnly) {
    where.NOT = {
      category: KONVA_PROJECT_EXPORT_CATEGORY,
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
        localId: true, // Para sincronização com desktop-app
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
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, type, dimensions, designData, dynamicFields, thumbnailUrl, category, tags, isPublic, isPremium, projectId, localId } = body

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

    if (!hasProjectWriteAccess(await withProjectOwner(project), { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // CP-X2b: forma vetorial inválida na raiz ou em qualquer página recusa ANTES da transação (422, nada criado).
    // `designData` ilegível segue como hoje: o JSON.parse de dentro da transação é que falha.
    exigirVetoresDoDesign(designData)

    // Criar template e páginas juntos em uma transação
    const template = await db.$transaction(async (tx) => {
      // Criar o template
      const newTemplate = await tx.template.create({
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
          localId: localId ?? null, // Salva o localId do desktop-app para sincronização
        },
      })

      // Criar páginas do design
      const designDataParsed = typeof designData === 'string' ? JSON.parse(designData) : designData
      const pages = Array.isArray(designDataParsed.pages) ? designDataParsed.pages : []

      if (pages.length > 0) {
        // Criar páginas do designData.pages (sincronização do desktop-app)
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]
          await tx.page.create({
            data: {
              name: page.name ?? `Página ${i + 1}`,
              width: page.width ?? designDataParsed.canvas?.width ?? 1080,
              height: page.height ?? designDataParsed.canvas?.height ?? 1920,
              layers: typeof page.layers === 'string' ? page.layers : JSON.stringify(page.layers ?? []),
              background: page.background ?? designDataParsed.canvas?.backgroundColor ?? '#ffffff',
              order: page.order ?? i,
              thumbnail: page.thumbnail ?? null,
              tags: Array.isArray(page.tags) ? page.tags : [],
              templateId: newTemplate.id,
            },
          })
        }
      } else {
        // Criar página inicial vazia (template criado pelo web)
        await tx.page.create({
          data: {
            name: 'Página 1',
            width: designDataParsed.canvas?.width ?? 1080,
            height: designDataParsed.canvas?.height ?? 1920,
            layers: JSON.stringify([]),
            background: designDataParsed.canvas?.backgroundColor ?? '#ffffff',
            order: 0,
            templateId: newTemplate.id,
          },
        })
      }

      return newTemplate
    })

    // A miniatura só pode ir para o Blob depois de o template existir — o
    // caminho é o id dele. Ver src/lib/templates/miniatura.ts.
    if (ehMiniaturaEmbutida(template.thumbnailUrl)) {
      const url = await guardarMiniatura(template.thumbnailUrl, template.id)
      if (url !== template.thumbnailUrl) {
        await db.template.update({ where: { id: template.id }, data: { thumbnailUrl: url } })
        template.thumbnailUrl = url
      }
    }

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    if (error instanceof VetorInvalido) {
      return NextResponse.json(corpoDoVetorInvalido(error), { status: 422 })
    }
    console.error('Error creating template:', error)
    return NextResponse.json({ error: 'Erro ao criar template' }, { status: 500 })
  }
}

function exigirVetoresDoDesign(designData: unknown) {
  let design: unknown = designData
  if (typeof design === 'string') {
    try {
      design = JSON.parse(design)
    } catch {
      return
    }
  }
  if (typeof design !== 'object' || design === null) return
  const { layers, pages } = design as { layers?: unknown; pages?: unknown }
  if (layers !== undefined) exigirVetoresValidos(layers)
  if (!Array.isArray(pages)) return
  pages.forEach((pagina: { id?: unknown; layers?: unknown } | null, i) => {
    exigirVetoresValidos(pagina?.layers, { paginaId: typeof pagina?.id === 'string' ? pagina.id : `#${i}` })
  })
}
