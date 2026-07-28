/**
 * Aprovação de rascunhos da agenda.
 *
 * Posts criados pelo conector MCP nascem como DRAFT: aparecem na agenda mas
 * ficam fora da fila de publicação (o executor só olha para SCHEDULED). Esta
 * rota e as tools do conector são as únicas portas entre os dois estados — e
 * as duas passam pela mesma lógica em src/lib/posts/agenda-acoes.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectWriteAccess } from '@/lib/projects/access'
import { processarAprovacao } from '@/lib/posts/agenda-acoes'
import { CreativeError } from '@/lib/creatives/errors'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId: projectIdParam } = await params
    const projectId = parseInt(projectIdParam, 10)

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: { select: { clerkOrgId: true, name: true } },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    if (!hasProjectWriteAccess(project, { userId: clerkUserId, orgId })) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json()
    const postIds: unknown = body?.postIds

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ error: 'Informe ao menos um post.' }, { status: 400 })
    }

    if (!postIds.every((id): id is string => typeof id === 'string')) {
      return NextResponse.json({ error: 'Lista de posts inválida.' }, { status: 400 })
    }

    const resultado = await processarAprovacao({
      projectId,
      postIds,
      action: body?.action === 'REVERT' ? 'REVERT' : 'APPROVE',
    })

    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[POSTS_APPROVAL] Erro ao processar aprovação:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
