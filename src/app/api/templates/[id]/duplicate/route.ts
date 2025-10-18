import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const templateId = Number(id)

    if (!templateId || isNaN(templateId)) {
      return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
    }

    // Buscar template original com verificação de ownership e suas páginas
    const original = await db.template.findFirst({
      where: { id: templateId },
      include: {
        Project: true,
        Page: {
          orderBy: { order: 'asc' }
        }
      },
    })

    if (!original) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    if (original.Project.userId !== userId) {
      return NextResponse.json({ error: 'Não autorizado para duplicar este template' }, { status: 403 })
    }

    // Criar cópia do template e suas páginas em uma transação
    const duplicate = await db.$transaction(async (tx) => {
      // Criar template duplicado
      const newTemplate = await tx.template.create({
        data: {
          name: `${original.name} (Cópia)`,
          type: original.type,
          dimensions: original.dimensions,
          designData: original.designData,
          dynamicFields: original.dynamicFields,
          thumbnailUrl: original.thumbnailUrl,
          category: original.category,
          tags: original.tags,
          isPublic: original.isPublic,
          isPremium: original.isPremium,
          projectId: original.projectId,
          createdBy: userId,
        },
      })

      // Se o template original tem páginas, duplicar todas
      if (original.Page && original.Page.length > 0) {
        await Promise.all(
          original.Page.map((page) =>
            tx.page.create({
              data: {
                name: page.name,
                width: page.width,
                height: page.height,
                layers: page.layers,
                background: page.background,
                order: page.order,
                thumbnail: page.thumbnail,
                templateId: newTemplate.id,
              },
            })
          )
        )
      } else {
        // Se não tem páginas, criar a primeira página padrão
        const designDataParsed = typeof original.designData === 'string'
          ? JSON.parse(original.designData)
          : original.designData

        await tx.page.create({
          data: {
            name: 'Página 1',
            width: (designDataParsed as { canvas?: { width?: number } }).canvas?.width ?? 1080,
            height: (designDataParsed as { canvas?: { height?: number } }).canvas?.height ?? 1920,
            layers: JSON.stringify([]),
            background: (designDataParsed as { canvas?: { backgroundColor?: string } }).canvas?.backgroundColor ?? '#ffffff',
            order: 0,
            templateId: newTemplate.id,
          },
        })
      }

      return newTemplate
    })

    return NextResponse.json(duplicate)
  } catch (error) {
    console.error('Failed to duplicate template:', error)
    return NextResponse.json({
      error: 'Erro ao duplicar template',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
