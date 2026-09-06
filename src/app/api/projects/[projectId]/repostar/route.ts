import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectReadAccess, withProjectOwner } from '@/lib/projects/access'
import { sugerirRepost } from '@/lib/posts/repostar-service'

export const runtime = 'nodejs'

/**
 * `GET /api/projects/[projectId]/repostar?quando=<ISO>&dias=60&excluirPostId=`
 *
 * As artes já publicadas que valem voltar ao ar no slot `quando`, ranqueadas
 * (ver `repostar.ts`). Só STORY. Rota própria porque a `/creatives` lista
 * todas as Generations sem paginação e não aguenta mais nada.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: param } = await params
  const projectId = Number.parseInt(param, 10)
  if (!Number.isFinite(projectId)) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { organizationProjects: { include: { organization: { select: { clerkOrgId: true, name: true } } } } },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!hasProjectReadAccess(await withProjectOwner(project), { userId, orgId })) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const quandoParam = req.nextUrl.searchParams.get('quando')
  const quando = quandoParam ? new Date(quandoParam) : null
  if (!quando || Number.isNaN(quando.getTime())) {
    return NextResponse.json({ error: 'Informe `quando` (ISO)' }, { status: 400 })
  }
  const diasParam = Number(req.nextUrl.searchParams.get('dias') ?? '')
  const excluirPostId = req.nextUrl.searchParams.get('excluirPostId') ?? undefined

  try {
    const resultado = await sugerirRepost({
      projectId,
      quando,
      dias: Number.isFinite(diasParam) && diasParam > 0 ? Math.min(diasParam, 365) : undefined,
      excluirPostId,
      superficie: 'agenda',
    })
    return NextResponse.json(resultado)
  } catch (erro) {
    console.error('[repostar] falhou:', erro)
    return NextResponse.json({ quando: quando.toISOString(), itens: [], total: 0 })
  }
}
