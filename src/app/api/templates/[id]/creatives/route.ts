import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

interface CreativeFieldValues {
  videoExport?: boolean
  originalJobId?: string
  isVideo?: boolean | string
  mimeType?: string
  thumbnailUrl?: string
  [key: string]: unknown
}

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
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const templateId = Number(id)

    if (!Number.isInteger(templateId) || templateId <= 0) {
      return NextResponse.json({ error: 'ID de template inválido' }, { status: 400 })
    }

    // Buscar template e verificar acesso (dono ou membro da organização)
    const template = await db.template.findFirst({
      where: { id: templateId },
      include: {
        Project: {
          include: {
            organizationProjects: {
              include: {
                organization: {
                  select: {
                    clerkOrgId: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    if (!hasProjectReadAccess(template.Project, { userId, orgId })) {
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
        fieldValues: true,
        Template: {
          select: {
            dimensions: true,
          },
        },
      },
    })

    // Processar as dimensões do template (formato: "1080x1920")
    const creativesWithDimensions = creatives.map((creative) => {
      const dimensions = creative.Template?.dimensions || '1080x1920'
      const [width, height] = dimensions.split('x').map(Number)
      const rawFieldValues =
        (creative.fieldValues as CreativeFieldValues | null | undefined) ?? null
      const fieldValues: CreativeFieldValues = rawFieldValues ?? {}
      const thumbnailUrl =
        typeof fieldValues.thumbnailUrl === 'string'
          ? (fieldValues.thumbnailUrl as string)
          : undefined
      const isVideo =
        fieldValues && (fieldValues.isVideo === true || fieldValues.isVideo === 'true')
      const mimeType =
        typeof fieldValues.mimeType === 'string'
          ? (fieldValues.mimeType as string)
          : undefined

      return {
        id: creative.id,
        resultUrl: creative.resultUrl ?? '',
        createdAt: creative.createdAt,
        templateName: creative.templateName ?? 'Criativo',
        projectName: creative.projectName ?? '',
        width: width || 1080,
        height: height || 1920,
        fieldValues,
        thumbnailUrl,
        isVideo,
        mimeType,
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
export async function DELETE(req: Request) {
  try {
    const { userId, orgId, orgRole } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const creativeId = searchParams.get('creativeId')

    if (!creativeId) {
      return NextResponse.json({ error: 'ID do criativo não fornecido' }, { status: 400 })
    }

    // Buscar criativo e verificar acesso (dono ou membro da organização)
    const creative = await db.generation.findFirst({
      where: { id: creativeId },
      include: {
        Template: {
          include: {
            Project: {
              include: {
                organizationProjects: {
                  include: {
                    organization: {
                      select: {
                        clerkOrgId: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!creative) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    if (!hasProjectWriteAccess(creative.Template?.Project ?? null, { userId, orgId, orgRole })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Deletar criativo
    await db.generation.delete({
      where: { id: creativeId },
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
