import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'

// POST - Duplicar página
export async function POST(
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

    // Buscar página a duplicar
    const pageToDuplicate = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!pageToDuplicate) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // A página duplicada será inserida logo após a página original
    // Calcular a nova posição (logo após a página original)
    const newOrder = pageToDuplicate.order + 1

    // Incrementar o order de todas as páginas que estão na nova posição ou superior
    await db.page.updateMany({
      where: {
        templateId,
        order: { gte: newOrder },
      },
      data: {
        order: { increment: 1 },
      },
    })

    // Criar cópia da página logo após a original
    // IMPORTANTE: Não copiar thumbnail - será gerado automaticamente pelo editor
    const newPage = await db.page.create({
      data: {
        name: `${pageToDuplicate.name} (cópia)`,
        width: pageToDuplicate.width,
        height: pageToDuplicate.height,
        layers: pageToDuplicate.layers, // Já está serializado no banco
        background: pageToDuplicate.background,
        thumbnail: null, // Não copiar thumbnail - será gerado ao abrir a página
        order: newOrder, // Logo após a página original
        templateId,
      },
    })

    // Deserializar layers na resposta
    const newPageWithParsedLayers = {
      ...newPage,
      layers: typeof newPage.layers === 'string' ? JSON.parse(newPage.layers) : newPage.layers,
    }

    return NextResponse.json(newPageWithParsedLayers, { status: 201 })
  } catch (error) {
    console.error('Error duplicating page:', error)
    return NextResponse.json(
      { error: 'Failed to duplicate page' },
      { status: 500 }
    )
  }
}
