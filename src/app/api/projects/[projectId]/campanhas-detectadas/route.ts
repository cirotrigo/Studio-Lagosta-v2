import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import {
  confirmarCampanha,
  desfazerCampanha,
  inventariarCampanhas,
} from '@/lib/aprendizado/campanhas-retroativas'
import { parseValidade } from '@/lib/knowledge/vigencia'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Campanhas descobertas no histórico (F2).
 *
 * GET  — as candidatas (aglomerados de um mesmo assunto em janela curta) e as
 *        entradas CAMPANHAS que já existem na base, para ligar a uma delas.
 * POST  — confirma: marca os posts como CAMPANHA e grava o `campaignId`
 *        retroativo. É o clique que descontamina a cadência. Com
 *        `acao: 'desfazer'`, tira a marcação (a entrada da base fica).
 *
 * O desfazer entra no POST em vez de num DELETE porque o `api.delete` do
 * cliente da casa não manda corpo, e a lista de posts é o corpo. Duas rotas
 * para a mesma decisão seria pior.
 *
 * Casca fina sobre `src/lib/aprendizado/campanhas-retroativas.ts`.
 */

const postSchema = z
  .object({
    acao: z.enum(['confirmar', 'desfazer']).optional(),
    postIds: z.array(z.string().min(1).max(64)).min(1).max(400),
    /** Ligar a uma entrada CAMPANHAS que já existe. */
    campaignId: z.string().min(1).max(64).nullable().optional(),
    /** Ou criar o registro retroativo com este nome. */
    titulo: z.string().min(1).max(160).nullable().optional(),
    /** Fim da campanha (AAAA-MM-DD). Sem isso, a data da última peça. */
    fim: z.string().max(40).nullable().optional(),
    pilar: z.string().max(60).nullable().optional(),
  })
  .strict()


async function resolver(projectIdRaw: string) {
  const id = Number(projectIdRaw)
  if (!Number.isInteger(id) || id <= 0) return { erro: 'Projeto inválido', status: 400 as const }
  const project = await fetchProjectWithShares(id)
  if (!project) return { erro: 'Projeto não encontrado', status: 404 as const }
  return { id, project }
}

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectReadAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const dias = Number(new URL(req.url).searchParams.get('dias') ?? '')
    const inventario = await inventariarCampanhas(r.id, {
      ...(Number.isFinite(dias) && dias > 0
        ? { desde: new Date(Date.now() - dias * 24 * 3600_000) }
        : {}),
    })
    return NextResponse.json(inventario)
  } catch (error) {
    console.error('[campanhas-detectadas] GET falhou', error)
    return NextResponse.json({ error: 'Erro ao procurar campanhas no histórico' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectWriteAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    if (parsed.data.acao === 'desfazer') {
      const desfeitos = await desfazerCampanha(r.id, parsed.data.postIds)
      return NextResponse.json({ desfeitos })
    }

    let fim: Date | null | undefined
    try {
      fim = parseValidade(parsed.data.fim ?? undefined, 'fim da campanha')
    } catch (erro) {
      return NextResponse.json(
        { error: erro instanceof Error ? erro.message : 'Data de fim inválida' },
        { status: 400 },
      )
    }

    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const resultado = await confirmarCampanha({
      projectId: r.id,
      postIds: parsed.data.postIds,
      campaignId: parsed.data.campaignId,
      titulo: parsed.data.titulo,
      fim: fim ?? null,
      pilar: parsed.data.pilar,
      confirmadoPor: dbUser?.id ?? null,
    })
    return NextResponse.json(resultado)
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Erro ao confirmar a campanha'
    console.error('[campanhas-detectadas] POST falhou', error)
    return NextResponse.json({ error: mensagem }, { status: 400 })
  }
}
