/**
 * POST — a equipe decidiu NÃO responder este item. Vale para todos (estado
 * no banco): o item sai da fila da Caixa, do rascunho automático e do aviso
 * de negativa. `ignoradoPor` é auditoria (User.id INTERNO, só LEITURA —
 * criar User aqui é como nascem os fantasmas) e nunca bloqueia o gesto.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { projetosVisiveisDaSessao } from '@/lib/caixa/acesso'

export const runtime = 'nodejs'
export const maxDuration = 15

const schema = z.object({
  projectId: z.number(),
  comentarioId: z.string().optional(),
  reviewId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido malformado' }, { status: 400 })
  const { projectId, comentarioId, reviewId } = parsed.data
  if (!comentarioId && !reviewId)
    return NextResponse.json({ error: 'Mande comentarioId ou reviewId.' }, { status: 400 })

  const projetos = await projetosVisiveisDaSessao(userId, orgId)
  if (!projetos.some((p) => p.id === projectId))
    return NextResponse.json({ error: 'Sem acesso a este cliente.' }, { status: 403 })

  const quemIgnorou =
    (await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } }))?.id ?? null

  try {
    if (reviewId) {
      const avaliacao = await db.avaliacaoGoogle.findUnique({ where: { reviewId }, select: { id: true, projectId: true } })
      if (!avaliacao || avaliacao.projectId !== projectId)
        return NextResponse.json({ error: 'Avaliação não encontrada para este cliente.' }, { status: 404 })
      await db.avaliacaoGoogle.update({
        where: { id: avaliacao.id },
        data: { ignoradaEm: new Date(), ignoradaPor: quemIgnorou },
      })
    } else {
      // Upsert: dois cliques (ou duas pessoas) no mesmo item não viram erro.
      await db.comentarioIgnorado.upsert({
        where: { comentarioId: comentarioId! },
        create: { projectId, comentarioId: comentarioId!, ignoradoPor: quemIgnorou },
        update: {},
      })
    }
    return NextResponse.json({ ok: true })
  } catch (erro) {
    console.error('[caixa] ignorar falhou:', erro)
    return NextResponse.json({ error: 'Não deu para ignorar agora.' }, { status: 500 })
  }
}
