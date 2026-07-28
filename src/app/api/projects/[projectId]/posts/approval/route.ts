/**
 * Aprovação de rascunhos da agenda.
 *
 * Posts criados pelo conector MCP nascem como DRAFT: aparecem na agenda mas
 * ficam fora da fila de publicação (o executor só olha para SCHEDULED). Este
 * endpoint é a única porta entre os dois estados, nos dois sentidos.
 *
 * Aprovar é ação que sai para o Instagram do cliente, então a rota valida por
 * post e devolve o que foi ignorado e por quê — em lote, falhar tudo por causa
 * de um post com horário vencido seria pior do que aprovar o resto e avisar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { PostStatus } from '../../../../../../../prisma/generated/client'
import { hasProjectWriteAccess } from '@/lib/projects/access'
import { getLaterClient } from '@/lib/later'

type Acao = 'APPROVE' | 'REVERT'

interface Ignorado {
  postId: string
  motivo: string
}

const formatarBRT = (data: Date) =>
  data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

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
    const action: Acao = body?.action === 'REVERT' ? 'REVERT' : 'APPROVE'

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json(
        { error: 'Informe ao menos um post.' },
        { status: 400 },
      )
    }

    if (!postIds.every((id): id is string => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'Lista de posts inválida.' },
        { status: 400 },
      )
    }

    // Sem conta conectada não há para onde publicar; barra a aprovação inteira
    // em vez de deixar o post virar SCHEDULED e falhar depois na fila.
    if (action === 'APPROVE' && !project.instagramAccountId) {
      return NextResponse.json(
        {
          error: `O projeto "${project.name}" ainda não tem conta do Instagram conectada. Conecte a conta nas configurações antes de aprovar.`,
        },
        { status: 400 },
      )
    }

    const posts = await db.socialPost.findMany({
      where: { id: { in: postIds }, projectId },
      select: {
        id: true,
        status: true,
        scheduledDatetime: true,
        laterPostId: true,
        mediaUrls: true,
        pageId: true,
        renderStatus: true,
      },
    })

    const encontrados = new Map(posts.map((post) => [post.id, post]))
    const ignorados: Ignorado[] = []
    const processados: string[] = []

    for (const postId of postIds) {
      if (!encontrados.has(postId)) {
        ignorados.push({ postId, motivo: 'Post não encontrado neste projeto.' })
      }
    }

    const agora = new Date()

    for (const post of posts) {
      if (action === 'APPROVE') {
        if (post.status !== PostStatus.DRAFT) {
          ignorados.push({
            postId: post.id,
            motivo:
              post.status === PostStatus.SCHEDULED
                ? 'Já estava agendado.'
                : 'Só dá para aprovar post que está como rascunho.',
          })
          continue
        }

        if (!post.scheduledDatetime) {
          ignorados.push({
            postId: post.id,
            motivo: 'Sem data e horário definidos. Reagende antes de aprovar.',
          })
          continue
        }

        // O executor tem catch-up de 6h: aprovar com horário vencido publicaria
        // na hora, sem o usuário esperar por isso.
        if (post.scheduledDatetime.getTime() <= agora.getTime()) {
          ignorados.push({
            postId: post.id,
            motivo: `O horário já passou (${formatarBRT(post.scheduledDatetime)}). Reagende antes de aprovar.`,
          })
          continue
        }

        // Sem imagem e sem página de template não há o que publicar — aprovado
        // assim, o post só falharia depois, na hora do envio.
        if (post.mediaUrls.length === 0 && !post.pageId) {
          ignorados.push({
            postId: post.id,
            motivo: 'Este rascunho está sem arte. Adicione a imagem antes de aprovar.',
          })
          continue
        }

        // Post de template ainda sem arte: agenda o render agora, senão o envio
        // antecipado despacharia o post sem imagem. Sem mídia, re-renderizar é
        // sempre a escolha segura — inclusive se constar RENDERED, porque o
        // envio publica a partir de mediaUrls, nunca de renderedImageUrl.
        // renderAttempts volta a zero (como em invalidate-renders): reaprovar
        // um post cujo render falhou 3x precisa renderizar de novo, não ficar
        // preso para sempre fora do filtro renderAttempts < 3 do cron.
        const precisaRender = post.pageId !== null && post.mediaUrls.length === 0

        await db.socialPost.update({
          where: { id: post.id },
          data: {
            status: PostStatus.SCHEDULED,
            errorMessage: null,
            failedAt: null,
            processingStartedAt: null,
            ...(precisaRender
              ? { renderStatus: 'PENDING', nextRenderAt: agora, renderAttempts: 0, renderError: null }
              : {}),
          },
        })
        processados.push(post.id)
        continue
      }

      // REVERT — voltar para rascunho
      if (post.status !== PostStatus.SCHEDULED) {
        ignorados.push({
          postId: post.id,
          motivo:
            post.status === PostStatus.DRAFT
              ? 'Já era rascunho.'
              : 'Post já saiu para publicação e não pode voltar a rascunho.',
        })
        continue
      }

      // O executor envia posts futuros para o Zernio com antecedência. Se o post
      // já está lá, marcar DRAFT no banco não impede nada: ele publicaria assim
      // mesmo e a agenda estaria mentindo. Só volta a rascunho se conseguir
      // tirar da fila remota.
      if (post.laterPostId) {
        try {
          const laterClient = getLaterClient()
          await laterClient.deletePost(post.laterPostId)
        } catch (error) {
          console.error(
            `[POSTS_APPROVAL] Falha ao remover post do Zernio (${post.laterPostId}):`,
            error,
          )
          ignorados.push({
            postId: post.id,
            motivo:
              'Não foi possível tirar o post da fila de publicação. Tente de novo em instantes.',
          })
          continue
        }
      }

      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.DRAFT,
          laterPostId: null,
          lateStatus: null,
          processingStartedAt: null,
        },
      })
      processados.push(post.id)
    }

    const total = processados.length
    const plural = total === 1 ? 'post' : 'posts'
    const mensagem =
      action === 'APPROVE'
        ? total > 0
          ? `${total} ${plural} ${total === 1 ? 'aprovado' : 'aprovados'} e na fila de publicação.`
          : 'Nenhum post foi aprovado.'
        : total > 0
          ? `${total} ${plural} ${total === 1 ? 'voltou' : 'voltaram'} para rascunho.`
          : 'Nenhum post voltou para rascunho.'

    return NextResponse.json({
      processados,
      ignorados,
      mensagem,
    })
  } catch (error) {
    console.error('[POSTS_APPROVAL] Erro ao processar aprovação:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
