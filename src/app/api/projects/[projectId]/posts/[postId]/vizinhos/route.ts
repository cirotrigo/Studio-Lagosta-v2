import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

/**
 * Os VIZINHOS de um post na linha do tempo da agenda — o que permite revisar a
 * semana andando de post em post, sem voltar para a grade (pedido do Ciro em
 * 30/08/2026).
 *
 * A ordem é a da agenda: `scheduledDatetime` crescente, com o id como
 * desempate estável para dois posts no MESMO minuto (o caso real dos 3 stories
 * do mesmo slot). Post sem horário fica fora da trilha — sem chave de ordem
 * não há "próximo" honesto. Duas consultas O(1) com o índice de projeto; nada
 * de carregar a lista inteira para achar dois ids.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; postId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { projectId: projectIdParam, postId } = await params
    const projectId = parseInt(projectIdParam, 10)
    if (isNaN(projectId)) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const project = await fetchProjectWithShares(projectId)
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const atual = await db.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, projectId: true, scheduledDatetime: true },
    })
    if (!atual || atual.projectId !== projectId) {
      return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 })
    }
    if (!atual.scheduledDatetime) {
      return NextResponse.json({ anterior: null, proximo: null })
    }

    const selecao = { id: true, scheduledDatetime: true, postType: true, status: true } as const

    const [anterior, proximo] = await Promise.all([
      db.socialPost.findFirst({
        where: {
          projectId,
          scheduledDatetime: { not: null },
          OR: [
            { scheduledDatetime: { lt: atual.scheduledDatetime } },
            { scheduledDatetime: atual.scheduledDatetime, id: { lt: atual.id } },
          ],
        },
        orderBy: [{ scheduledDatetime: 'desc' }, { id: 'desc' }],
        select: selecao,
      }),
      db.socialPost.findFirst({
        where: {
          projectId,
          scheduledDatetime: { not: null },
          OR: [
            { scheduledDatetime: { gt: atual.scheduledDatetime } },
            { scheduledDatetime: atual.scheduledDatetime, id: { gt: atual.id } },
          ],
        },
        orderBy: [{ scheduledDatetime: 'asc' }, { id: 'asc' }],
        select: selecao,
      }),
    ])

    const paraFora = (p: typeof anterior) =>
      p
        ? {
            id: p.id,
            quando: p.scheduledDatetime?.toISOString() ?? null,
            postType: p.postType,
            status: p.status,
          }
        : null

    return NextResponse.json({ anterior: paraFora(anterior), proximo: paraFora(proximo) })
  } catch (error) {
    console.error('[agenda] erro ao buscar vizinhos do post:', error)
    return NextResponse.json({ anterior: null, proximo: null })
  }
}
