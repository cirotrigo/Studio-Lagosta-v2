import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { atualizarPlano, lerPlano } from '@/lib/planos/plano-service'
import { reconciliarPlano } from '@/lib/planos/reconciliar'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Um plano de conteúdo (F3).
 *
 * GET   — o plano com os itens em ordem e o progresso agregado.
 * PATCH — muda o que é do PLANO (título, situação). O conteúdo de cada item
 *         muda em `…/itens/[itemId]`.
 *
 * Casca fina sobre `src/lib/planos/plano-service.ts`, que é quem sabe que plano
 * de outro cliente é 404 — nunca 403, que já confirmaria a existência da linha.
 */

const patchSchema = z.object({
  titulo: z.string().max(200).nullable().optional(),
  /** 'ativo' | 'arquivado'. Arquivar encerra a leva; os itens ficam. */
  status: z.string().max(30).nullable().optional(),
})

async function resolver(projectIdRaw: string) {
  const id = Number(projectIdRaw)
  if (!Number.isInteger(id) || id <= 0) return { erro: 'Projeto inválido', status: 400 as const }
  const project = await fetchProjectWithShares(id)
  if (!project) return { erro: 'Projeto não encontrado', status: 404 as const }
  return { id, project }
}

function tratar(error: unknown, contexto: string) {
  if (error instanceof CreativeError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error(`[planos] ${contexto} falhou`, error)
  return NextResponse.json({ error: 'Erro ao trabalhar com o plano' }, { status: 500 })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; planoId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { projectId, planoId } = await params
    const r = await resolver(projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectReadAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Confere o que as artes viraram ANTES de responder: nada avisa o plano
    // quando a fila durável termina uma geração (ela não conhece plano, e é de
    // propósito), então sem isto a bancada mostraria "na fila" para sempre com
    // a arte pronta na galeria ao lado. Nunca lança — ver `reconciliar.ts`.
    await reconciliarPlano(r.id, planoId)

    const plano = await lerPlano(r.id, planoId)
    return NextResponse.json({ plano })
  } catch (error) {
    return tratar(error, 'GET de um plano')
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; planoId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { projectId, planoId } = await params
    const r = await resolver(projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectWriteAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const plano = await atualizarPlano({
      projectId: r.id,
      planoId,
      titulo: parsed.data.titulo,
      status: parsed.data.status,
    })
    return NextResponse.json({ plano })
  } catch (error) {
    return tratar(error, 'PATCH de um plano')
  }
}
