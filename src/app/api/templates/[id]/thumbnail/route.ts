import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { generateThumbnail } from '@/lib/generation-utils'

export const runtime = 'nodejs'
export const maxDuration = 30 // 30 segundos para thumbnail

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const templateId = parseInt(id)

    // Buscar template com verificação de ownership
    const template = await db.template.findFirst({
      where: { id: templateId },
      include: {
        Project: {
          select: {
            userId: true,
          },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    // Verificar ownership
    if (template.Project.userId !== userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Gerar thumbnail
    try {
      const thumbnailUrl = await generateThumbnail(template)

      // Atualizar template com URL do thumbnail
      await db.template.update({
        where: { id: templateId },
        data: { thumbnailUrl },
      })

      return NextResponse.json({ thumbnailUrl })
    } catch (error) {
      console.error('[API] Failed to generate thumbnail:', error)
      return NextResponse.json(
        { error: 'Erro ao gerar thumbnail', details: String(error) },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('[API] Failed to process thumbnail request:', error)
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 500 })
  }
}
