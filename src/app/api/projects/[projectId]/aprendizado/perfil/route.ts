import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { montarPerfil, perfilParaPrompt } from '@/lib/aprendizado/perfil'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * O perfil aprendido do cliente (F2) — leitura.
 *
 * Devolve o objeto inteiro E o bloco de texto que a geração vai receber
 * (`paraPrompt`), lado a lado de propósito: é a mesma ideia da prévia do DNA na
 * aba Marca — a tela mostra o que o gerador realmente vai ler, e não uma versão
 * bonita escrita à parte que envelhece sozinha.
 *
 * O perfil é CALCULADO na hora, sem tabela de snapshot. Ele é uma agregação de
 * dados que já existem (posts classificados, sinais, histórico de templates) e
 * um snapshot só acrescentaria a pergunta "quando isto foi atualizado pela
 * última vez?" — que é justamente o defeito de um perfil que aprende sozinho.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const id = Number((await params).projectId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const perfil = await montarPerfil(id)
    return NextResponse.json({ ...perfil, paraPrompt: perfilParaPrompt(perfil) })
  } catch (error) {
    console.error('[aprendizado] perfil falhou', error)
    return NextResponse.json({ error: 'Erro ao montar o perfil aprendido' }, { status: 500 })
  }
}
