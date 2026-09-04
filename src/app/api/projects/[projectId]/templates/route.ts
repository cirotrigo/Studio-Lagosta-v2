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
   * A CAPA da pasta: as primeiras peças, em mosaico. A pasta não tem
   * `thumbnailUrl` própria, e a miniatura de uma peça só não diz que aquilo é
   * a semana de stories — foi o que o Ciro apontou em 04/09/2026 ("apenas o
   * thumbnail do primeiro slide não identifica o que é").
   *
   * 🔴 Miniatura `data:` fica de FORA: o PageSync sobrescreve `Page.thumbnail`
   * com um JPEG base64 assim que a página é aberta no editor, e mandar isso
   * numa listagem multiplicaria o payload por pasta. Sem nenhuma miniatura
   * publicável, a capa cai no desenho neutro do card.
   */
  const capas = new Map<number, string[]>()
  const CAPAS_POR_PASTA = 4
  if (pastas.length > 0) {
    const paginas = await db.page.findMany({
      where: { templateId: { in: pastas.map((t) => t.id) } },
      select: { id: true, templateId: true, thumbnail: true },
      orderBy: { order: 'asc' },
    })
    for (const p of paginas) {
      if (!p.thumbnail || p.thumbnail.startsWith('data:')) continue
      const atual = capas.get(p.templateId) ?? []
      if (atual.length >= CAPAS_POR_PASTA) continue
      capas.set(p.templateId, [...atual, p.thumbnail])
    }
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
