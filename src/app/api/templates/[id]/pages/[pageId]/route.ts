import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateReadAccess,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'

const updatePageSchema = z.object({
  name: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  layers: z.array(z.unknown()).optional(),
  background: z.string().optional(),
  order: z.number().int().optional(),
  thumbnail: z.string().optional(),
})

// GET - Buscar página específica
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateReadAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Buscar página
    const page = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Deserializar layers
    const pageWithParsedLayers = {
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
    }

    return NextResponse.json(pageWithParsedLayers)
  } catch (error) {
    console.error('Error fetching page:', error)
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    )
  }
}

// PATCH - Atualizar página
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Verificar se a página existe e pertence ao template
    const existingPage = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!existingPage) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updatePageSchema.parse(body)

    // Preparar dados com layers serializados se fornecidos
    const updateData: Record<string, unknown> = { ...validatedData }
    if (validatedData.layers !== undefined) {
      updateData.layers = JSON.stringify(validatedData.layers)
    }

    // Atualizar página
    const page = await db.page.update({
      where: { id: pageId },
      data: updateData,
    })

    // Deserializar layers na resposta
    const pageWithParsedLayers = {
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
    }

    return NextResponse.json(pageWithParsedLayers)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating page:', error)
    return NextResponse.json(
      { error: 'Failed to update page' },
      { status: 500 }
    )
  }
}

// DELETE - Remover página
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Verificar se é a última página (deve ter ao menos 1)
    const pageCount = await db.page.count({
      where: { templateId },
    })

    if (pageCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last page' },
        { status: 400 }
      )
    }

    // Verificar se a página existe
    const existingPage = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!existingPage) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Verificar se a página é um modelo
    if (existingPage.isTemplate) {
      return NextResponse.json(
        {
          error: 'template_page',
          message: 'Não é possível excluir página modelo. Desmarque como modelo primeiro.'
        },
        { status: 403 }
      )
    }

    // Obter order da página a ser deletada
    const pageOrder = existingPage.order

    // Deletar página
    await db.page.delete({
      where: { id: pageId },
    })

    // Reordenar páginas restantes (diminuir order de páginas que estavam após a deletada)
    await db.page.updateMany({
      where: {
        templateId,
        order: { gt: pageOrder },
      },
      data: {
        order: { decrement: 1 },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting page:', error)
    return NextResponse.json(
      { error: 'Failed to delete page' },
      { status: 500 }
    )
  }
}
