/**
 * Avisos de falha de publicação no grupo de WhatsApp da equipe.
 *
 * As mensagens são escritas para quem vai resolver o problema, não para quem
 * escreveu o código: nada de status de banco (FAILED/DRAFT/SCHEDULED), nada de
 * id interno. O que importa é cliente, tipo de post, horário que era para sair,
 * motivo e o link da agenda.
 *
 * Agrupamento: quando vários posts falham na mesma rodada de cron, mandar uma
 * mensagem por post viraria enxurrada. `withFailureNotificationBatch` abre um
 * acumulador; tudo que for registrado lá dentro sai numa mensagem só no fim.
 * Fora de um batch, o aviso é enviado na hora.
 */

import { PostType } from '../../../prisma/generated/client'
import { isEvolutionConfigured, sendWhatsAppText } from './evolution'

const TIMEZONE = 'America/Sao_Paulo'
const MAX_REASON_LENGTH = 220

export type FailureKind = 'PUBLICACAO' | 'LEMBRETE'

export interface PostFailureNotice {
  postId: string
  projectId: number
  projectName: string
  postType: PostType
  /** Quando o post deveria ter ido ao ar. */
  scheduledFor: Date | null
  /** Motivo em linguagem de gente — vai direto para a mensagem. */
  reason: string
  /** Quantas tentativas de publicação já falharam (1 = primeira). */
  attempts: number
  kind: FailureKind
}

// Acumulador do batch em aberto. `null` = nenhum batch, envia na hora.
let batch: PostFailureNotice[] | null = null

/**
 * Executa `fn` acumulando os avisos e envia tudo numa mensagem só no final.
 * Reentrante: se já houver um batch aberto, apenas repassa o mesmo acumulador.
 */
export async function withFailureNotificationBatch<T>(
  fn: () => Promise<T>
): Promise<T> {
  const isOuterBatch = batch === null
  if (isOuterBatch) batch = []

  try {
    return await fn()
  } finally {
    if (isOuterBatch) {
      const pending = batch ?? []
      batch = null
      if (pending.length > 0) {
        await flush(pending)
      }
    }
  }
}

/**
 * Registra um aviso de falha. Nunca lança — problema de notificação não pode
 * virar problema de publicação.
 */
export async function notifyPostFailure(notice: PostFailureNotice): Promise<void> {
  try {
    if (batch) {
      batch.push(notice)
      return
    }
    await flush([notice])
  } catch (error) {
    console.error('[Notificações] Falha ao registrar aviso de post:', error)
  }
}

async function flush(notices: PostFailureNotice[]): Promise<void> {
  try {
    if (!isEvolutionConfigured()) {
      console.warn(
        `[Notificações] ${notices.length} aviso(s) de falha não enviados — Evolution não configurada`
      )
      return
    }
    await sendWhatsAppText(buildMessage(dedupeByPost(notices)))
  } catch (error) {
    console.error('[Notificações] Falha ao enviar avisos de post:', error)
  }
}

/**
 * Rede de segurança: se dois caminhos registrarem o mesmo post na mesma rodada,
 * ele aparece uma vez só — mantendo a versão com mais tentativas, que é a mais
 * informativa.
 */
function dedupeByPost(notices: PostFailureNotice[]): PostFailureNotice[] {
  const porPost = new Map<string, PostFailureNotice>()

  for (const notice of notices) {
    const atual = porPost.get(notice.postId)
    if (!atual || notice.attempts > atual.attempts) {
      porPost.set(notice.postId, notice)
    }
  }

  return [...porPost.values()]
}

function postTypeLabel(postType: PostType): string {
  switch (postType) {
    case PostType.STORY:
      return 'story'
    case PostType.CAROUSEL:
      return 'carrossel'
    case PostType.REEL:
      return 'reels'
    case PostType.POST:
    default:
      return 'post'
  }
}

/** "29/07 às 16:00", no fuso de Brasília. */
function formatScheduledFor(date: Date | null): string {
  if (!date) return 'sem horário definido'

  const day = date.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  })
  const time = date.toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${day} às ${time}`
}

/**
 * Mensagens de erro do Zernio vêm com quebras de linha, emoji e blocos de
 * ajuda de várias linhas. No WhatsApp isso vira parede de texto — colapsa e
 * corta.
 */
function cleanReason(reason: string): string {
  const collapsed = reason.replace(/\s+/g, ' ').trim()
  if (!collapsed) return 'motivo não informado'
  return collapsed.length > MAX_REASON_LENGTH
    ? `${collapsed.slice(0, MAX_REASON_LENGTH - 1)}…`
    : collapsed
}

function agendaLink(projectId: number): string {
  const baseUrl = (
    process.env.STUDIO_LAGOSTA_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '')

  return `${baseUrl}/projects/${projectId}?tab=agenda`
}

function describe(notice: PostFailureNotice): string {
  const tipo = postTypeLabel(notice.postType)
  const quando = notice.scheduledFor
    ? `que era para sair ${formatScheduledFor(notice.scheduledFor)}`
    : 'sem horário definido'

  if (notice.kind === 'LEMBRETE') {
    return `Lembrete não avisado: ${tipo} do ${notice.projectName} ${quando}.`
  }

  const vezes = notice.attempts > 1 ? `Falhou ${notice.attempts}x` : 'Falhou'
  return `${vezes}: ${tipo} do ${notice.projectName} ${quando}.`
}

export function buildMessage(notices: PostFailureNotice[]): string {
  if (notices.length === 1) {
    const notice = notices[0]
    const titulo =
      notice.kind === 'LEMBRETE'
        ? '⚠️ *Lembrete de publicação não avisado*'
        : '🚨 *Falha na publicação*'

    return [
      titulo,
      '',
      describe(notice),
      `Motivo: ${cleanReason(notice.reason)}`,
      '',
      `Ver agenda: ${agendaLink(notice.projectId)}`,
    ].join('\n')
  }

  const itens = notices.map((notice, index) =>
    [
      `${index + 1}. ${describe(notice)}`,
      `   Motivo: ${cleanReason(notice.reason)}`,
      `   Ver agenda: ${agendaLink(notice.projectId)}`,
    ].join('\n')
  )

  return [
    `🚨 *${notices.length} publicações com problema*`,
    '',
    itens.join('\n\n'),
  ].join('\n')
}
