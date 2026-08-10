import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { listarReferenciasDeEstilo } from '@/lib/ai/style-references'

export const runtime = 'nodejs'

/**
 * As artes marcadas como referência de estilo do projeto, NA ORDEM DO RODÍZIO
 * — a primeira é a que entra na próxima geração.
 *
 * A ordem é o conteúdo aqui: uma lista sem ela seria só uma galeria filtrada,
 * e o que a pessoa precisa saber é quem vai influenciar a próxima arte.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const projectId = Number((await params).projectId)
    if (Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    return NextResponse.json({ referencias: await listarReferenciasDeEstilo(projectId) })
  } catch (error) {
    console.error('[style-references] falhou:', error)
    return NextResponse.json({ error: 'Erro ao listar as referências' }, { status: 500 })
  }
}
