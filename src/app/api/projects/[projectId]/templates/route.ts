import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { createTemplateSchema } from '@/lib/validations/studio'
import { createBlankDesign } from '@/lib/studio/defaults'
import type { Prisma } from '@/lib/prisma-types'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  // Check if designData should be included (for sync)
  const url = new URL(req.url)
  const includeDesign = url.searchParams.get('includeDesign') === 'true'

  const templates = await db.template.findMany({
    where: { projectId: projectIdNum },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { Page: true },
      },
      // Include pages with layers and tags for full design data
      ...(includeDesign ? { Page: { orderBy: { order: 'asc' }, select: { id: true, name: true, width: true, height: true, layers: true, background: true, order: true, thumbnail: true, tags: true } } } : {}),
    },
  })

  // Transform response to include designData when requested
  if (includeDesign) {
    const templatesWithDesign = templates.map((template) => {
      const pages = (template as typeof template & { Page?: Array<{ id: string; name: string; width: number; height: number; layers: unknown; background: string | null; order: number; thumbnail: string | null; tags: string[] }> }).Page ?? []

      // Build designData structure expected by desktop-app
      const designData = {
        canvas: {
          width: pages[0]?.width ?? 1080,
          height: pages[0]?.height ?? 1920,
          backgroundColor: pages[0]?.background ?? '#ffffff',
        },
        pages: pages.map((page) => ({
          id: page.id,
          name: page.name,
          width: page.width,
          height: page.height,
          layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : (page.layers ?? []),
          background: page.background ?? '#ffffff',
          order: page.order,
          thumbnail: page.thumbnail,
          tags: page.tags ?? [],
        })),
      }

      // Return template with designData, excluding Page relation
      const { Page: _pages, ...rest } = template as typeof template & { Page?: unknown }
      return {
        ...rest,
        designData,
      }
    })

    return NextResponse.json(templatesWithDesign)
  }

  /**
   * Situação das PASTAS de programação (aba de templates, 03/09/2026): quantas
   * peças, quantas já na agenda, publicadas, rascunhos. Uma consulta por
   * resposta, só para as pastas que têm categoria de programação.
   */
  const pastas = templates.filter((t) => t.category === 'programacao' || t.category === 'avulsas')
  const situacao = new Map<number, { pecas: number; agendadas: number; publicadas: number; rascunhos: number; falhas: number }>()

  /**
   * A CAPA: as primeiras peças do template, em mosaico.
   *
   * Serve a dois casos, medidos em produção em 04/09/2026:
   *  - a PASTA de programação, que não tem `thumbnailUrl` própria (nasce de
   *    `garantirPasta`) e para a qual a miniatura de UMA peça não diria que
   *    aquilo é a semana de stories;
   *  - o template SEM `thumbnailUrl` de qualquer seção, que hoje mostra
   *    "Sem preview" — 61 dos 67 do ARQUIVO, e é lá que o resgate acontece
   *    (18 ganham mosaico). Em `equipe` e `assinatura` o ganho medido é ZERO:
   *    119 dos 130 já têm `thumbnailUrl`, e os 11 restantes têm só miniatura
   *    `data:`. Por isso a regra é por DADO (tem thumbnail?) e não por seção.
   *
   * 🔴 Miniatura `data:` fica de FORA, e o filtro vive no WHERE, não em JS: o
   * PageSync sobrescreve `Page.thumbnail` com um JPEG base64 (média 17,6 KB)
   * assim que a página é aberta no editor. Medido no projeto 4: trazer as
   * páginas e filtrar depois custa 4.810 KB; filtrando no banco, 5 KB.
   *
   * 🔴 CROSS JOIN LATERAL, não `ROW_NUMBER() OVER (PARTITION BY ...)`: a
   * janela precisa ler e DESTOASTAR o thumbnail de TODAS as páginas antes de
   * descartar as que passam de 4. Medido no projeto 8: 13,00 ms e 8807
   * buffers contra 1,00 ms e 618 do LATERAL, que para assim que acha 4.
   */
  const capas = new Map<number, string[]>()
  const CAPAS_POR_TEMPLATE = 4
  const precisamDeCapa = new Set(
    templates.filter((t) => !t.thumbnailUrl || t.category === 'programacao' || t.category === 'avulsas').map((t) => t.id),
  )
  if (precisamDeCapa.size > 0) {
    const linhas = await db.$queryRaw<Array<{ templateId: number; thumbnail: string }>>`
      SELECT t.id AS "templateId", capa.thumbnail
      FROM "Template" t
      CROSS JOIN LATERAL (
        SELECT p.thumbnail, p."order" AS ord, p.id
        FROM "Page" p
        WHERE p."templateId" = t.id
          AND p.thumbnail IS NOT NULL
          AND p.thumbnail NOT LIKE 'data:%'
        ORDER BY p."order" ASC, p.id ASC
        LIMIT ${CAPAS_POR_TEMPLATE}
      ) capa
      WHERE t."projectId" = ${projectIdNum}
      ORDER BY t.id, capa.ord ASC, capa.id ASC
    `
    for (const l of linhas) {
      if (!precisamDeCapa.has(l.templateId)) continue
      const atual = capas.get(l.templateId) ?? []
      if (atual.length >= CAPAS_POR_TEMPLATE) continue
      capas.set(l.templateId, [...atual, l.thumbnail])
    }
  }

  if (pastas.length > 0) {
    const paginas = await db.page.findMany({
      where: { templateId: { in: pastas.map((t) => t.id) } },
      select: { id: true, templateId: true },
    })
    const porPagina = new Map(paginas.map((p) => [p.id, p.templateId]))
    const posts = await db.socialPost.findMany({
      where: { pageId: { in: paginas.map((p) => p.id) } },
      select: { pageId: true, status: true },
    })
    for (const t of pastas) situacao.set(t.id, { pecas: t._count.Page, agendadas: 0, publicadas: 0, rascunhos: 0, falhas: 0 })
    for (const post of posts) {
      const tid = post.pageId ? porPagina.get(post.pageId) : undefined
      const s = tid !== undefined ? situacao.get(tid) : undefined
      if (!s) continue
      if (post.status === 'POSTED') s.publicadas++
      else if (post.status === 'DRAFT') s.rascunhos++
      else if (post.status === 'FAILED') s.falhas++
      else s.agendadas++
    }
  }

  return NextResponse.json(
    templates.map((t) => ({
      ...t,
      ...(situacao.has(t.id) ? { situacao: situacao.get(t.id) } : {}),
      ...(capas.has(t.id) ? { capa: capas.get(t.id) } : {}),
    })),
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const authData = await auth()
  if (!authData.userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId: authData.userId, orgId: authData.orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  try {
    const payload = await req.json()
    const parsed = createTemplateSchema.parse(payload)

    const blankDesign = createBlankDesign(parsed.type)

    // Criar template e primeira página juntos em uma transação
    const template = await db.$transaction(async (tx) => {
      // Criar o template
      const newTemplate = await tx.template.create({
        data: {
          name: parsed.name,
          type: parsed.type,
          dimensions: parsed.dimensions,
          projectId: projectIdNum,
          createdBy: authData.userId,
          designData: blankDesign as unknown as Prisma.JsonValue,
          dynamicFields: [] as unknown as Prisma.JsonValue,
        },
      })

      // Criar automaticamente a primeira página (Página 1) com o design inicial
      // Esta página serve como "template base" e preserva o design original
      await tx.page.create({
        data: {
          name: 'Página 1',
          width: blankDesign.canvas.width,
          height: blankDesign.canvas.height,
          layers: JSON.stringify([]), // Página inicial vazia
          background: blankDesign.canvas.backgroundColor,
          order: 0, // Sempre primeira página
          templateId: newTemplate.id,
        },
      })

      return newTemplate
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Failed to create template', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
