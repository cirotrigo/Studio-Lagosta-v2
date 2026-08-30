/**
 * POST — rascunho de resposta para a equipe editar. Mesmo contrato da tool
 * `propor-resposta` do MCP: avaliação devolve o guardado (ou gera e guarda —
 * clique repetido vira leitura); comentário gera na hora com lastro na base.
 * Sem cobrança de créditos (precedente da dica de copy).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { projetosVisiveisDaSessao } from '@/lib/caixa/acesso'
import { sugerirRespostaDeAvaliacao, sugerirRespostaDeComentario } from '@/lib/avaliacoes/sugerir-resposta'

export const runtime = 'nodejs'
export const maxDuration = 60

const schema = z.object({
  projectId: z.number(),
  reviewId: z.string().optional(),
  texto: z.string().optional(),
  autor: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido malformado' }, { status: 400 })
  const { projectId, reviewId, texto, autor } = parsed.data
  if (!reviewId && !texto?.trim())
    return NextResponse.json({ error: 'Mande reviewId ou o texto do comentário.' }, { status: 400 })

  const projetos = await projetosVisiveisDaSessao(userId, orgId)
  const projeto = projetos.find((p) => p.id === projectId)
  if (!projeto) return NextResponse.json({ error: 'Sem acesso a este cliente.' }, { status: 403 })

  try {
    if (reviewId) {
      const avaliacao = await db.avaliacaoGoogle.findUnique({ where: { reviewId } })
      if (!avaliacao || avaliacao.projectId !== projectId)
        return NextResponse.json({ error: 'Avaliação não encontrada para este cliente.' }, { status: 404 })
      if (avaliacao.respostaSugerida)
        return NextResponse.json({ rascunho: avaliacao.respostaSugerida, origem: 'guardado' })
      const rascunho = await sugerirRespostaDeAvaliacao({
        projectId,
        nomeCliente: projeto.name,
        autor: autor ?? avaliacao.autor,
        estrelas: avaliacao.estrelas,
        texto: avaliacao.texto,
      })
      if (!rascunho)
        return NextResponse.json({ error: 'Não consegui montar o rascunho agora — tente de novo.' }, { status: 502 })
      await db.avaliacaoGoogle.update({
        where: { id: avaliacao.id },
        data: { respostaSugerida: rascunho, sugestaoGeradaEm: new Date() },
      })
      return NextResponse.json({ rascunho, origem: 'gerado' })
    }

    const rascunho = await sugerirRespostaDeComentario({
      projectId,
      nomeCliente: projeto.name,
      autor: autor ?? null,
      texto: texto!.trim(),
    })
    if (!rascunho)
      return NextResponse.json({ error: 'Não consegui montar o rascunho agora — tente de novo.' }, { status: 502 })
    return NextResponse.json({ rascunho, origem: 'gerado' })
  } catch (erro) {
    console.error('[caixa] rascunho falhou:', erro)
    return NextResponse.json({ error: 'Não deu para gerar o rascunho.' }, { status: 500 })
  }
}
