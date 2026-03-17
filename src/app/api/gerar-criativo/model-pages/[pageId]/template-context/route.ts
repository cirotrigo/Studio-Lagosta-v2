import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import {
  buildTemplateContextFromLayers,
  inferTemplateFormatFromDimensions,
} from '@/lib/gerar-criativo/template-context'
import type { Layer } from '@/types/template'

interface RouteContext {
  params: Promise<{
    pageId: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { pageId } = await context.params

    const page = await db.page.findFirst({
      where: {
        id: pageId,
        isTemplate: true,
        OR: [
          {
            Template: {
              Project: {
                userId: user.id,
              },
            },
          },
          ...(orgId
            ? [{
                Template: {
                  Project: {
                    organizationProjects: {
                      some: {
                        organization: {
                          clerkOrgId: orgId,
                        },
                      },
                    },
                  },
                },
              }]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        templateName: true,
        templateId: true,
        width: true,
        height: true,
        layers: true,
        Template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!page) {
      return NextResponse.json({ error: 'Model page not found' }, { status: 404 })
    }

    const layers = (typeof page.layers === 'string'
      ? JSON.parse(page.layers)
      : page.layers) as Layer[]

    const format = inferTemplateFormatFromDimensions(page.width, page.height)
    const templateContext = buildTemplateContextFromLayers({
      templateId: String(page.templateId ?? page.Template.id),
      templateName: page.templateName || page.Template.name,
      format,
      pageId: page.id,
      pageName: page.name,
      layers,
    })

    if (!templateContext) {
      return NextResponse.json({
        templateContext: null,
        warnings: ['Nenhuma camada de texto dinamica encontrada para extrair contexto do template.'],
      })
    }

    return NextResponse.json({
      templateContext,
      warnings: [],
    })
  } catch (error) {
    console.error('[template-context] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build template context' },
      { status: 500 },
    )
  }
}
