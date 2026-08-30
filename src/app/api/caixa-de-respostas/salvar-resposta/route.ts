/**
 * POST — a equipe APROVOU a resposta de uma avaliação do Google. Não publica
 * nada: grava a versão final em `respostaAprovada`, e uma sessão do Claude
 * publica a fila via conector Windsor (scripts/respostas-salvas.ts lista;
 * a ação `reply_to_review` sai pelo conector, que é o único caminho).
 *
 * Salvar de novo SUBSTITUI — a última aprovação vence, como no Google.
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
  reviewId: z.string().min(1),
  mensagem: z.string().min(1).max(4096),
})

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido malformado' }, { status: 400 })
  const { projectId, reviewId, mensagem } = parsed.data

  const projetos = await projetosVisiveisDaSessao(userId, orgId)
  if (!projetos.some((p) => p.id === projectId))
    return NextResponse.json({ error: 'Sem acesso a este cliente.' }, { status: 403 })

  const avaliacao = await db.avaliacaoGoogle.findUnique({ where: { reviewId }, select: { id: true, projectId: true } })
  if (!avaliacao || avaliacao.projectId !== projectId)
    return NextResponse.json({ error: 'Avaliação não encontrada para este cliente.' }, { status: 404 })

  const quemAprovou =
    (await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } }))?.id ?? null

  try {
    await db.avaliacaoGoogle.update({
      where: { id: avaliacao.id },
      data: {
        respostaAprovada: mensagem.trim(),
        respostaAprovadaEm: new Date(),
        respostaAprovadaPor: quemAprovou,
        // Aprovar desfaz um ignorar anterior — a decisão mais nova vence.
        ignoradaEm: null,
        ignoradaPor: null,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (erro) {
    console.error('[caixa] salvar-resposta falhou:', erro)
    return NextResponse.json({ error: 'Não deu para salvar agora.' }, { status: 500 })
  }
}
