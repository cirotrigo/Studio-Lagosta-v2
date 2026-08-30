/**
 * POST — publica a resposta a um COMENTÁRIO de Instagram, em nome da conta
 * do cliente, pela Graph API com o token do projeto. Quem decide o texto é a
 * pessoa (o rascunho é editável na Caixa); aqui só se publica o que veio.
 *
 * Avaliação do Google NÃO passa por aqui — não há caminho server-side para a
 * ação do Windsor (só o conector OAuth); o envio dela é pelo Farol.
 *
 * A Graph API só aceita responder comentário de mídia da PRÓPRIA conta do
 * token — a posse é garantida pela API, não por nós. O que o app garante é o
 * acesso da pessoa ao cliente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { projetosVisiveisDaSessao } from '@/lib/caixa/acesso'
import { InstagramApiException, InstagramGraphApiClient } from '@/lib/instagram/graph-api-client'

export const runtime = 'nodejs'
export const maxDuration = 30

const schema = z.object({
  projectId: z.number(),
  comentarioId: z.string().min(1),
  mensagem: z.string().min(1).max(2200),
})

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido malformado' }, { status: 400 })
  const { projectId, comentarioId, mensagem } = parsed.data

  const projetos = await projetosVisiveisDaSessao(userId, orgId)
  if (!projetos.some((p) => p.id === projectId))
    return NextResponse.json({ error: 'Sem acesso a este cliente.' }, { status: 403 })

  const projeto = await db.project.findUnique({
    where: { id: projectId },
    select: { instagramAccessToken: true, name: true },
  })
  if (!projeto?.instagramAccessToken)
    return NextResponse.json(
      { error: `${projeto?.name ?? 'Este cliente'} não tem token do Instagram — copie a resposta e publique pelo app.` },
      { status: 409 },
    )

  try {
    const cliente = new InstagramGraphApiClient(projeto.instagramAccessToken)
    const resultado = await cliente.replyToComment(comentarioId, mensagem)

    // Memória do que o app publicou: o Windsor serve cache e o reply_count
    // demora a virar — sem esta linha, a pergunta respondida voltava para a
    // fila no refresh. Falha aqui NUNCA desfaz a publicação que já saiu.
    try {
      const quemRespondeu =
        (await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } }))?.id ?? null
      await db.comentarioRespondido.upsert({
        where: { comentarioId },
        create: { projectId, comentarioId, respostaId: resultado.id ?? null, respondidoPor: quemRespondeu },
        update: { respostaId: resultado.id ?? null },
      })
    } catch (erro) {
      console.error('[caixa] resposta publicada, mas falhou ao registrar a memória:', erro)
    }

    return NextResponse.json({ ok: true, respostaId: resultado.id })
  } catch (erro) {
    if (erro instanceof InstagramApiException) {
      // Token sem o escopo de comentários é o caso esperado mais provável —
      // a mensagem da API (sanitizada) diz isso melhor que qualquer genérico.
      return NextResponse.json({ error: `O Instagram recusou: ${erro.message}` }, { status: 502 })
    }
    console.error('[caixa] responder falhou:', erro)
    return NextResponse.json({ error: 'Não deu para publicar a resposta.' }, { status: 500 })
  }
}
