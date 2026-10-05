import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { assinaturasDaMarca } from '@/lib/brand/aba-marca'

export const runtime = 'nodejs'

/** "Identidade visual" da aba Marca: as páginas de assinatura (variantes) com miniatura e atalho ao editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const projectId = Number((await params).projectId)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectReadAccess(project, { userId, orgId })) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    return NextResponse.json(await assinaturasDaMarca(projectId))
  } catch (error) {
    console.error('[assinatura] GET failed', error)
    return NextResponse.json({ error: 'Erro ao listar as assinaturas' }, { status: 500 })
  }
}
