import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { resumoDosFatos } from '@/lib/brand/aba-marca'

export const runtime = 'nodejs'

/** "Fatos da casa" da aba Marca: o RESUMO da base (contagens, prazos), com atalhos — nunca uma cópia do conteúdo. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const projectId = Number((await params).projectId)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectReadAccess(project, { userId, orgId })) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    return NextResponse.json(await resumoDosFatos(projectId))
  } catch (error) {
    console.error('[fatos] GET failed', error)
    return NextResponse.json({ error: 'Erro ao resumir a base' }, { status: 500 })
  }
}
