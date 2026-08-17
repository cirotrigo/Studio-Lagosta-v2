import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'
import { hasProjectOwnership } from '@/lib/projects/access'

const toggleTemplateSchema = z.object({
  isTemplate: z.boolean(),
})

// PATCH - Alternar status de modelo da página
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId, orgRole } = await auth()
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

    /**
     * Promover é CURADORIA, não edição: o modelo passa a valer para todos que
     * criam arte deste cliente e entra no pool que `prepareCreative`,
     * `sugerirPosts` e a bancada consultam. Por isso o gate é o mesmo das
     * outras portas de curadoria — `POST /api/projects/[id]/modelos` e
     * `PATCH .../template-pages/[pageId]/tags` —, e não o write access do
     * template, que qualquer membro da organização tem.
     *
     * A diferença importa desde 16/08/2026, quando o editor voltou a expor o
     * botão: sem isto, um membro comum promoveria o modelo pelo editor e
     * esbarraria no 403 da rota de tags logo em seguida, deixando no pool
     * exatamente o modelo sem tag que ninguém acha por tema.
     */
    if (!hasProjectOwnership(template!.Project, { userId, orgId, orgRole })) {
      return NextResponse.json(
        {
          error:
            'Apenas o curador (dono do projeto ou admin da org compartilhada) pode definir modelos.',
        },
        { status: 403 },
      )
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

    // Atualizar página
    const page = await db.page.update({
      where: { id: pageId },
      data: {
        isTemplate: validatedData.isTemplate,
      },
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