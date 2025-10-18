import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

// POST - Duplicar página
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar ownership do template
    const template = await db.template.findFirst({
      where: {
        id: templateId,
        createdBy: userId,
      },
    })

    if (!template) {
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

    // A página duplicada será sempre inserida na posição 1 (segunda página)
    // Primeiro, incrementar o order de todas as páginas que estão na posição 1 ou superior
    await db.page.updateMany({
      where: {
        templateId,
        order: { gte: 1 },
      },
      data: {
        order: { increment: 1 },
      },
    })

    // Criar cópia da página na posição 1 (segunda página)
    const newPage = await db.page.create({
      data: {
        name: `${pageToDuplicate.name} (cópia)`,
        width: pageToDuplicate.width,
        height: pageToDuplicate.height,
        layers: pageToDuplicate.layers, // Já está serializado no banco
        background: pageToDuplicate.background,
        order: 1, // Sempre segunda página
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
