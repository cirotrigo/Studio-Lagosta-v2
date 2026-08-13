import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { proporSemana } from '@/lib/planos/propor-semana'
import { MAX_ITENS_POR_PLANO } from '@/lib/planos/plano-service'

export const runtime = 'nodejs'
/**
 * ⚠️ `maxDuration` INLINE — o glob do `vercel.json` é `app/api/**` e o projeto
 * é `src/app/**`, então declarar lá não pega (regra da casa).
 *
 * A montagem chama o modelo de texto UMA vez (`montarDicasDeCopy`, com abort
 * próprio em 90s) e o resto é banco + catálogo do acervo (buscas em paralelo).
 * 120s cobre o pior caso: 90s do LLM + a folga para cadência, fotos e o
 * `criarPlano`. Se o LLM estourar o abort, o serviço degrada para leva sem
 * copy — nunca precisa de mais tempo por causa disso.
 */
export const maxDuration = 120

/**
 * POST /api/projects/[projectId]/propor-semana
 *
 * Monta a programação da semana e a PERSISTE como plano de conteúdo (F3,
 * trilho B). **Não produz arte nenhuma e não cobra crédito** — o que sai daqui
 * é intenção; quem produz é `/executar-plano`, com gate de confirmação.
 *
 * Casca fina sobre `proporSemana` (`src/lib/planos/propor-semana.ts`), o mesmo
 * serviço da tool `propor-semana` do MCP — a regra não diverge entre a tela e
 * o chat. A resposta é o `ResultadoDaProposta` do serviço, tal e qual.
 */

const bodySchema = z.object({
  /** Quantos dias à frente olhar. Sem isto, a leva vai até domingo (BRT). */
  dias: z.number().int().min(1).max(14).optional(),
  maxItens: z.number().int().min(1).max(MAX_ITENS_POR_PLANO).optional(),
  formato: z.enum(['story', 'feed', 'quadrado']).nullable().optional(),
  /** Recado de quem pediu ("é semana de festival"), repassado à dica de copy. */
  observacao: z.string().max(500).nullable().optional(),
  titulo: z.string().max(200).nullable().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const projectId = Number((await params).projectId)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Corpo vazio é o caso comum (o botão da bancada não pergunta nada).
    const corpo = await req.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(corpo ?? {})
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    /**
     * `criadoPor` é o `User.id` INTERNO, nunca o clerkId — e a busca é somente
     * LEITURA de propósito: criar User a partir de um campo de auditoria é
     * exatamente como nascem os Users fantasma deste banco. Quem ainda não tem
     * linha deixa a coluna nula.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const resultado = await proporSemana({
      projectId,
      dias: parsed.data.dias,
      maxItens: parsed.data.maxItens,
      formato: parsed.data.formato ?? null,
      observacao: parsed.data.observacao ?? null,
      titulo: parsed.data.titulo ?? null,
      criadoPor: dbUser?.id ?? null,
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[propor-semana] POST falhou', error)
    return NextResponse.json({ error: 'Erro ao montar a semana' }, { status: 500 })
  }
}
