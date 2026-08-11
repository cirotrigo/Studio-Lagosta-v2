import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import { lerPilares, proporPilares, salvarPilares } from '@/lib/aprendizado/pilares-service'
import { MAX_PILARES } from '@/lib/aprendizado/pilares'

export const runtime = 'nodejs'
/** O passe de proposta lê o histórico e chama o modelo uma vez. */
export const maxDuration = 120

/**
 * A taxonomia de pilares do projeto (F2).
 *
 * GET  — a lista (aprovada + proposta) e a distribuição do histórico já
 *        classificado, que é o que dá contexto para aprovar.
 * POST — pede uma PROPOSTA ao modelo, a partir do histórico do próprio
 *        cliente. Grava como não aprovada e NUNCA toca no que já foi aprovado.
 * PUT  — grava a lista que a pessoa aprovou.
 *
 * Casca fina sobre `src/lib/aprendizado/pilares-service.ts` — a regra da casa
 * vale aqui: rota embrulha serviço.
 */

const pilarSchema = z.object({
  slug: z.string().max(60).optional(),
  nome: z.string().min(1).max(60),
  descricao: z.string().max(400).nullable().optional(),
  exemplos: z.array(z.string().max(60)).max(12).optional(),
})

const putSchema = z.object({
  pilares: z.array(pilarSchema).max(MAX_PILARES + 4),
})

async function resolver(projectIdRaw: string) {
  const id = Number(projectIdRaw)
  if (!Number.isInteger(id) || id <= 0) return { erro: 'Projeto inválido', status: 400 as const }
  const project = await fetchProjectWithShares(id)
  if (!project) return { erro: 'Projeto não encontrado', status: 404 as const }
  return { id, project }
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectReadAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const [pilares, distribuicao] = await Promise.all([
      lerPilares(r.id),
      db.socialPost.groupBy({
        by: ['pilar'],
        where: { projectId: r.id, status: 'POSTED' },
        _count: { _all: true },
      }),
    ])

    return NextResponse.json({
      pilares,
      distribuicao: distribuicao
        .map((d) => ({ pilar: d.pilar, total: d._count._all }))
        .sort((a, b) => b.total - a.total),
    })
  } catch (error) {
    console.error('[pilares] GET falhou', error)
    return NextResponse.json({ error: 'Erro ao carregar os pilares' }, { status: 500 })
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectWriteAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const proposta = await proporPilares(r.id)
    return NextResponse.json(proposta)
  } catch (error) {
    console.error('[pilares] POST (proposta) falhou', error)
    return NextResponse.json({ error: 'Erro ao propor os pilares' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectWriteAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = putSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // `aprovadoPor` é o `User.id` INTERNO, nunca o clerkId. Só leitura: quem
    // ainda não tem linha deixa a coluna nula — criar User a partir de código
    // de auditoria é como nascem os fantasmas.
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const resultado = await salvarPilares(r.id, parsed.data.pilares, {
      aprovar: true,
      aprovadoPor: dbUser?.id ?? null,
    })
    return NextResponse.json(resultado)
  } catch (error) {
    console.error('[pilares] PUT falhou', error)
    return NextResponse.json({ error: 'Erro ao salvar os pilares' }, { status: 500 })
  }
}
