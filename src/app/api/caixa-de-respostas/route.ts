/**
 * GET — as pendências de conversa (comentários IG + avaliações Google) dos
 * projetos que o usuário enxerga. A leitura de comentários vai ao Windsor ao
 * vivo, por isso o maxDuration folgado.
 */
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { projetosVisiveisDaSessao } from '@/lib/caixa/acesso'
import { montarCaixa } from '@/lib/caixa/itens'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const projetos = await projetosVisiveisDaSessao(userId, orgId)
    if (!projetos.length) return NextResponse.json({ comentarios: [], avaliacoes: [], clientes: [] })
    const caixa = await montarCaixa(projetos)
    return NextResponse.json(caixa)
  } catch (erro) {
    console.error('[caixa] GET falhou:', erro)
    return NextResponse.json({ error: 'Não deu para montar a caixa agora.' }, { status: 500 })
  }
}
