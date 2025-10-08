import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  // Buscar template original com verificação de ownership
  const original = await db.template.findFirst({
    where: { id: templateId },
    include: { Project: true },
  })

  if (!original || original.Project.userId !== userId) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  try {
    // Criar cópia do template
    const duplicate = await db.template.create({
      data: {
        name: `${original.name} (Cópia)`,
        type: original.type,
        dimensions: original.dimensions,
        designData: original.designData,
        dynamicFields: original.dynamicFields,
        thumbnailUrl: original.thumbnailUrl,
        projectId: original.projectId,
      },
    })

    return NextResponse.json(duplicate)
  } catch (error) {
    console.error('Failed to duplicate template', error)
    return NextResponse.json({ error: 'Erro ao duplicar template' }, { status: 500 })
  }
}
