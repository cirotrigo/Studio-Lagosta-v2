import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { sugerirPosts } from '@/lib/posts/sugerir-posts'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Slots livres da cadência do cliente, para a bancada e o agendamento.
 *
 * O motor (`sugerirPosts`) deriva o ritmo do HISTÓRICO — não há cadência
 * configurada no Studio, decisão de 01/08/2026 — e já existia pronto, mas só
 * o MCP consumia. Esta rota é a superfície que faltava: é o que permite a
 * bancada pré-selecionar o próximo horário livre em vez de pedir um datetime
 * no vazio.
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const id = Number(projectId)
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(id)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const dias = Number(new URL(req.url).searchParams.get('dias')) || 7

  try {
    return NextResponse.json(await sugerirPosts({ projectId: id, dias }))
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[slots] erro inesperado:', error)
    return NextResponse.json({ error: 'Erro ao calcular os horários' }, { status: 500 })
  }
}
