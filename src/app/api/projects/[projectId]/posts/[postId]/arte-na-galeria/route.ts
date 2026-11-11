/**
 * POST /api/projects/{projectId}/posts/{postId}/arte-na-galeria
 *
 * Traz para a galeria a arte de um post que veio do Zernio, para a melhoria com
 * IA ter de onde partir (`trazerArteDoPostParaGaleria`). A agenda chama isto ao
 * clicar em "Melhorar com IA" num post desses, e abre o modal com o que volta.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectWriteAccess, withProjectOwner } from '@/lib/projects/access'
import { trazerArteDoPostParaGaleria } from '@/lib/posts/arte-do-post-na-galeria'
import { CreativeError } from '@/lib/creatives/errors'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; postId: string }> },
) {
  try {
    const { projectId: projectIdParam, postId } = await params
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
          include: { organization: { select: { clerkOrgId: true, name: true } } },
        },
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }
    if (!hasProjectWriteAccess(await withProjectOwner(project), { userId: clerkUserId, orgId })) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const indice = Number.isInteger(body?.indice) ? (body.indice as number) : 0

    // Só leitura, de propósito: criar User daqui é como nascem os Users fantasma.
    const dbUser = await db.user.findUnique({ where: { clerkId: clerkUserId }, select: { id: true } })

    const arte = await trazerArteDoPostParaGaleria({
      projectId,
      postId,
      indice,
      createdBy: dbUser?.id ?? null,
      canal: 'studio',
    })
    return NextResponse.json(arte)
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json(error.toJSON(), { status: error.status })
    }
    console.error('[ARTE_NA_GALERIA] Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
