import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'

const toggleTemplateSchema = z.object({
  isTemplate: z.boolean(),
  templateName: z.string().min(3).max(50).optional(),
})

// PATCH - Alternar status de modelo da página
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
    const validatedData = toggleTemplateSchema.parse(body)

    // Se marcar como modelo, exigir templateName
    if (validatedData.isTemplate && !validatedData.templateName) {
      return NextResponse.json(
        { error: 'Template name is required when marking as template' },
        { status: 400 }
      )
    }

    // Se desmarcar como modelo, limpar templateName
    const updateData = {
      isTemplate: validatedData.isTemplate,
      templateName: validatedData.isTemplate ? validatedData.templateName : null,
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

    console.error('Error toggling template status:', error)
    return NextResponse.json(
      { error: 'Failed to toggle template status' },
      { status: 500 }
    )
  }
}