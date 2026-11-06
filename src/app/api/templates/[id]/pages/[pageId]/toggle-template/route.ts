import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'
import { hasProjectOwnership } from '@/lib/projects/access'
import { decidirDespromocao, postsQueDependemDaPagina } from '@/lib/modelos/despromover'

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

    /**
     * Atualizar página. B1d (checkpoint f): trocar `isTemplate` muda o que o render desenha (modelo aplica os slots
     * do post; o contrato semântico só vale em modelo) — os renders da página voltam à fila na MESMA transação, e uma
     * falha semântica `PAGINA_DE_CONTEUDO` se recupera quando a página vira modelo. Sem mudança, nada a invalidar.
     */
    /**
     * Despromover (true → false) passa pela guarda de posts dependentes (`src/lib/modelos/despromover.ts`): post vivo
     * com copy própria perderia essa copy no próximo render. A leitura roda DENTRO da transação que grava.
     */
    const despromovendo = existingPage.isTemplate && !validatedData.isTemplate
    const resultado =
      existingPage.isTemplate !== validatedData.isTemplate
        ? await db.$transaction(async (tx) => {
            if (despromovendo) {
              const decisao = decidirDespromocao(await postsQueDependemDaPagina(tx, pageId))
              if (!decisao.permitido) return { recusa: decisao }
            }
            const atualizada = await tx.page.update({ where: { id: pageId }, data: { isTemplate: validatedData.isTemplate } })
            const { congelados } = await invalidateScheduledRenders(tx, { pageIds: [pageId] })
            return { page: atualizada, congelados }
          })
        : { page: await db.page.update({ where: { id: pageId }, data: { isTemplate: validatedData.isTemplate } }), congelados: [] }

    if ('recusa' in resultado) {
      return NextResponse.json(
        {
          error: 'MODELO_COM_POSTS',
          mensagem: resultado.recusa.mensagem,
          // `message` repete a frase: é o campo que `apiClient` lê para montar o erro na UI.
          message: resultado.recusa.mensagem,
          posts: resultado.recusa.posts,
        },
        { status: 409 },
      )
    }

    const { page, congelados } = resultado
    // Deserializar layers na resposta. `congelados`: posts já entregues ao publicador, que saem com a arte anterior.
    const pageWithParsedLayers = {
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
      congelados,
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