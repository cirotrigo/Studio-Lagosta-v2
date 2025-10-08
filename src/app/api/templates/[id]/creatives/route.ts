import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/templates/[id]/creatives
 * Retorna todos os criativos gerados para um template específico
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id: templateIdStr } = await params
    const templateId = parseInt(templateIdStr, 10)

    if (!templateId || isNaN(templateId)) {
      return NextResponse.json({ error: 'ID de template inválido' }, { status: 400 })
    }

    // Buscar template e verificar ownership
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

    if (template.Project.userId !== userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Buscar todos os criativos do template
    const creatives = await db.generation.findMany({
      where: {
        templateId,
        status: 'COMPLETED',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        resultUrl: true,
        createdAt: true,
        templateName: true,
        projectName: true,
        Template: {
          select: {
            dimensions: true,
          },
        },
      },
    })

    // Processar as dimensões do template (formato: "1080x1920")
    const creativesWithDimensions = creatives.map((creative) => {
      const dimensions = creative.Template.dimensions || '1080x1920'
      const [width, height] = dimensions.split('x').map(Number)

      return {
        id: creative.id,
        resultUrl: creative.resultUrl,
        createdAt: creative.createdAt,
        templateName: creative.templateName,
        projectName: creative.projectName,
        width: width || 1080,
        height: height || 1920,
      }
    })

    console.log('[GET_CREATIVES] Found', creativesWithDimensions.length, 'creatives for template', templateId)
    console.log('[GET_CREATIVES] Creatives:', JSON.stringify(creativesWithDimensions, null, 2))

    return NextResponse.json(creativesWithDimensions)
  } catch (error) {
    console.error('[GET_CREATIVES] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar criativos' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/templates/[id]/creatives/[creativeId]
 * Remove um criativo específico
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const creativeId = searchParams.get('creativeId')

    if (!creativeId) {
      return NextResponse.json({ error: 'ID do criativo não fornecido' }, { status: 400 })
    }

    const generationId = parseInt(creativeId, 10)
    if (isNaN(generationId)) {
      return NextResponse.json({ error: 'ID do criativo inválido' }, { status: 400 })
    }

    // Buscar criativo e verificar ownership
    const creative = await db.generation.findFirst({
      where: { id: generationId },
      include: {
        Template: {
          include: {
            Project: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    })

    if (!creative) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    if (creative.Template.Project.userId !== userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Deletar criativo
    await db.generation.delete({
      where: { id: generationId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE_CREATIVE] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar criativo' },
      { status: 500 }
    )
  }
}
