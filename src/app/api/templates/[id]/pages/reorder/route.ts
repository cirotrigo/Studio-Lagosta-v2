import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'

const reorderPagesSchema = z.object({
  pageIds: z.array(z.string()).min(1),
})

// POST - Reordenar páginas e atualizar seus nomes
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const body = await request.json()
    const { pageIds } = reorderPagesSchema.parse(body)

    // Buscar todas as páginas para validar
    const pages = await db.page.findMany({
      where: {
        id: { in: pageIds },
        templateId,
      },
    })

    if (pages.length !== pageIds.length) {
      return NextResponse.json(
        { error: 'Some pages not found' },
        { status: 404 }
      )
    }

    // Atualizar order e name de cada página em uma transação
    await db.$transaction(
      pageIds.map((pageId, index) => {
        // Gerar nome no formato: Pag.01, Pag.02, etc.
        const pageNumber = String(index + 1).padStart(2, '0')
        const newName = `Pag.${pageNumber}`

        return db.page.update({
          where: { id: pageId },
          data: {
            order: index,
            name: newName,
          },
        })
      })
    )

    // Buscar páginas atualizadas
    const updatedPages = await db.page.findMany({
      where: { templateId },
      orderBy: { order: 'asc' },
    })

    // Deserializar layers de cada página
    const pagesWithParsedLayers = updatedPages.map(page => ({
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
    }))

    return NextResponse.json(pagesWithParsedLayers)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error reordering pages:', error)
    return NextResponse.json(
      { error: 'Failed to reorder pages' },
      { status: 500 }
    )
  }
}
