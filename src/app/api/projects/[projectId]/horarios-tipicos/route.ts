import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectReadAccess, withProjectOwner } from '@/lib/projects/access'
import { horariosTipicosDoProjeto } from '@/lib/posts/horarios-tipicos'

export const runtime = 'nodejs'

/**
 * `GET /api/projects/[projectId]/horarios-tipicos`
 *
 * Só leitura: os horários em que o cliente costuma publicar, por dia da
 * semana. É o que o formulário de post mostra como chips no bloco "Quando".
 * Não emite sugestão nenhuma (ver o cabeçalho de `horarios-tipicos.ts`).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
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

  try {
    const horarios = await horariosTipicosDoProjeto(projectId)
    return NextResponse.json(horarios)
  } catch (erro) {
    console.error('[horarios-tipicos] falhou:', erro)
    // Sem horários o formulário continua funcionando (só sem os chips).
    return NextResponse.json({ porDia: {}, fonte: 'vazio', postsConsiderados: 0 })
  }
}
