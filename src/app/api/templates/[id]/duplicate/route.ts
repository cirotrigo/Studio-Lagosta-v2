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

    // Buscar template original com verificação de ownership
    const original = await db.template.findFirst({
      where: { id: templateId },
      include: { Project: true },
    })

    if (!original) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    if (original.Project.userId !== userId) {
      return NextResponse.json({ error: 'Não autorizado para duplicar este template' }, { status: 403 })
    }

    // Criar cópia do template
    const duplicate = await db.template.create({
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

    return NextResponse.json(duplicate)
  } catch (error) {
    console.error('Failed to duplicate template:', error)
    return NextResponse.json({
      error: 'Erro ao duplicar template',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
