/**
 * O que fazer quando uma publicação falha: agendar nova tentativa e/ou avisar
 * a equipe no WhatsApp.
 *
 * Ponto único porque o post vira FAILED em vários lugares (envio ao Zernio,
 * render, sync, varredura de posts travados) e cada um deles precisa do mesmo
 * tratamento — sem criar retry duplicado quando mais de um caminho marca o
 * mesmo post.
 *
 * Nada aqui lança: falha de retry/notificação não pode derrubar publicação.
 */

import { db } from '@/lib/db'
import { PostLogEvent, RetryStatus } from '../../../prisma/generated/client'
import {
  notifyPostFailure,
  type FailureKind,
  type PostFailureNotice,
} from '@/lib/notifications/post-failure-notifier'

/** Nova tentativa 1 minuto depois da falha. O cron de posts roda a cada minuto. */
export const RETRY_DELAY_MS = 60 * 1000

/**
 * Janela para considerar que já existe uma cadeia de retry em andamento.
 * Cobre as 3 tentativas (≈3 min) com folga, mas deixa uma falha nova de dias
 * depois começar a própria cadeia.
 */
const RECENT_RETRY_WINDOW_MS = 30 * 60 * 1000

/** Depois desta tentativa a equipe é avisada (falhou o original + 1 retry). */
export const NOTIFY_AFTER_ATTEMPT = 1

/**
 * Motivo pelo qual repetir não vai adiantar, ou null se vale tentar de novo.
 * Erro determinístico (crédito, conta não conectada, formato de imagem) só
 * gastaria tentativa e atrasaria o aviso.
 */
export function nonRetryableReason(error: unknown): string | null {
  if (!(error instanceof Error)) return null

  if (error.name === 'InsufficientCreditsError') {
    return 'Créditos insuficientes na conta'
  }

  const message = error.message || ''

  if (message.includes('Later account not configured')) {
    return 'Projeto sem conta do Instagram conectada'
  }

  if (/aspect ratio/i.test(message) || message.includes('Formato de imagem incompatível')) {
    return 'Formato da imagem incompatível com o Instagram'
  }

  return null
}

interface PostForNotice {
  id: string
  projectId: number
  postType: PostFailureNotice['postType']
  scheduledDatetime: Date | null
  errorMessage: string | null
  laterPostId: string | null
  Project: { name: string }
}

async function loadPost(postId: string): Promise<PostForNotice | null> {
  return db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      postType: true,
      scheduledDatetime: true,
      errorMessage: true,
      laterPostId: true,
      Project: { select: { name: true } },
    },
  })
}

/**
 * Avisa a equipe sobre um post que falhou. Carrega os dados do post sozinho —
 * quem chama só precisa do id e do motivo.
 */
export async function notifyPublishFailure(
  postId: string,
  reason: string,
  options?: { attempts?: number; kind?: FailureKind }
): Promise<void> {
  try {
    const post = await loadPost(postId)
    if (!post) return

    await notifyPostFailure({
      postId: post.id,
      projectId: post.projectId,
      projectName: post.Project.name,
      postType: post.postType,
      scheduledFor: post.scheduledDatetime,
      reason,
      attempts: options?.attempts ?? 1,
      kind: options?.kind ?? 'PUBLICACAO',
    })
  } catch (error) {
    console.error(`[Falhas] Não foi possível avisar sobre o post ${postId}:`, error)
  }
}

/**
 * Trata a falha de envio de um post: agenda a primeira nova tentativa quando
 * faz sentido, ou avisa a equipe na hora quando repetir não resolve.
 *
 * Chamado do `catch` do envio, depois que o post já foi marcado como FAILED.
 */
export async function handlePublishFailure(
  postId: string,
  error: unknown
): Promise<void> {
  try {
    const post = await loadPost(postId)
    if (!post) return

    // Já existe cadeia de retry em andamento — ou porque outro caminho marcou o
    // mesmo post como FAILED, ou porque esta falha veio de dentro do próprio
    // `executeRetries`. Nesse caso a cadeia é dona tanto da próxima tentativa
    // quanto do aviso, então sair aqui evita retry e mensagem duplicados.
    const recentRetry = await db.postRetry.findFirst({
      where: {
        postId,
        createdAt: { gte: new Date(Date.now() - RECENT_RETRY_WINDOW_MS) },
      },
      select: { id: true },
    })

    if (recentRetry) return

    const blockedReason = nonRetryableReason(error)
    const reason =
      blockedReason ??
      post.errorMessage ??
      (error instanceof Error ? error.message : String(error))

    // Post que já chegou ao Zernio não pode ser reenviado: `sendToLater` ignora
    // qualquer post com laterPostId e devolveria "sucesso" sem publicar nada.
    // Limpar o laterPostId para forçar reenvio arriscaria publicação dupla.
    const alreadyOnZernio = Boolean(post.laterPostId)

    if (blockedReason || alreadyOnZernio) {
      await notifyPublishFailure(postId, reason)
      return
    }

    await db.postRetry.create({
      data: {
        postId,
        attemptNumber: 1,
        scheduledFor: new Date(Date.now() + RETRY_DELAY_MS),
        status: RetryStatus.PENDING,
      },
    })

    await db.postLog.create({
      data: {
        postId,
        event: PostLogEvent.RETRIED,
        message: 'Nova tentativa de publicação agendada para daqui a 1 minuto',
        metadata: { motivo: reason.slice(0, 500) },
      },
    })

    console.log(`🔁 Nova tentativa agendada para o post ${postId} (1 min)`)
  } catch (handlerError) {
    console.error(
      `[Falhas] Não foi possível tratar a falha do post ${postId}:`,
      handlerError
    )
  }
}
