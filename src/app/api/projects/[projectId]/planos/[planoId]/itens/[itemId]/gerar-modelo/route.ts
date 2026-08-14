import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { gerarItemPorModelo } from '@/lib/planos/executar-plano'

export const runtime = 'nodejs'
/**
 * Render de página com fontes de projeto leva alguns segundos; 120 é o mesmo
 * teto do finalize do gerar-criativo, que faz o mesmo trabalho.
 */
export const maxDuration = 120

/**
 * Monta a arte de UM item do plano sobre um modelo do cliente — o "Gerar" da
 * via template na bancada. Zero custo de API de imagem.
 *
 * `sourcePageId` é a escolha explícita da tela; sem ele vale o que o item já
 * tem, e sem nada a ROTAÇÃO decide (o modelo menos usado do formato). Vai no
 * corpo, e não só no item, porque a escolha pode ter acabado de ser feita — o
 * PATCH dela ainda pode estar em voo quando o Gerar chega.
 */
const bodySchema = z.object({
  sourcePageId: z.string().max(64).nullable().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; planoId: string; itemId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { projectId, planoId, itemId } = await params
    const id = Number(projectId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    /**
     * `decididoPor` é o `User.id` INTERNO, nunca o clerkId. Busca somente
     * LEITURA: criar User a partir de código de auditoria é como nascem os
     * Users fantasma que já existem neste banco.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const executado = await gerarItemPorModelo({
      projectId: id,
      planoId,
      itemId,
      sourcePageId: parsed.data.sourcePageId ?? null,
      decididoPor: dbUser?.id ?? null,
    })

    return NextResponse.json({ executado })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[planos] gerar-modelo falhou', error)
    return NextResponse.json({ error: 'Erro ao montar a arte no modelo' }, { status: 500 })
  }
}
