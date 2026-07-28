/**
 * Lembretes de publicação manual no WhatsApp.
 *
 * Posts com `publishType: REMINDER` não são publicados pelo sistema: alguém da
 * equipe publica na mão. Este módulo manda, minutos antes do horário, tudo que
 * essa pessoa precisa — a arte, a legenda para copiar, o primeiro comentário e
 * a observação do post.
 *
 * Antes isso saía como webhook para o n8n; desde julho/2026 vai direto pela
 * Evolution.
 */

import { PostType } from '../../../prisma/generated/client'
import { sendWhatsAppMedia, sendWhatsAppText, isEvolutionConfigured } from './evolution'
import { postTypeLabel } from './post-failure-notifier'

const TIMEZONE = 'America/Sao_Paulo'

export interface PublishReminder {
  postId: string
  projectId: number
  projectName: string
  instagramUsername: string | null
  postType: PostType
  scheduledFor: Date | null
  caption: string
  mediaUrls: string[]
  extraInfo: string | null
  firstComment: string | null
  /**
   * Lembrete que escapou da janela normal de 5-10 minutos: ou foi criado em
   * cima da hora, ou o cron não rodou a tempo. Muda o tom da mensagem para
   * quem recebe saber que é urgente.
   */
  late?: boolean
}

/** "hoje às 16:00" quando é no mesmo dia, senão "29/07 às 16:00". */
function formatQuando(date: Date | null): string {
  if (!date) return 'sem horário definido'

  const hora = date.toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
  const dia = date.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  })
  const hojeNoFuso = new Date().toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  })

  return dia === hojeNoFuso ? `hoje às ${hora}` : `${dia} às ${hora}`
}

function agendaLink(projectId: number): string {
  const baseUrl = (
    process.env.STUDIO_LAGOSTA_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '')

  return `${baseUrl}/projects/${projectId}?tab=agenda`
}

export function buildReminderMessage(reminder: PublishReminder): string {
  const perfil = reminder.instagramUsername
    ? ` (@${reminder.instagramUsername.replace(/^@/, '')})`
    : ''

  const tipo = postTypeLabel(reminder.postType).toUpperCase()
  const quando = formatQuando(reminder.scheduledFor)
  const jaPassou = Boolean(
    reminder.scheduledFor && reminder.scheduledFor.getTime() < Date.now()
  )

  const partes = reminder.late
    ? [
        '⏰ *Publicar agora*',
        '',
        jaPassou
          ? `${tipo} do ${reminder.projectName}${perfil} — o horário era ${quando} e ainda não saiu.`
          : `${tipo} do ${reminder.projectName}${perfil} — publicar ${quando}, em cima da hora.`,
      ]
    : [
        '📣 *Hora de publicar*',
        '',
        `${tipo} do ${reminder.projectName}${perfil} — publicar ${quando}.`,
      ]

  if (reminder.caption?.trim()) {
    partes.push('', '*Legenda:*', reminder.caption.trim())
  }

  if (reminder.firstComment?.trim()) {
    partes.push('', '*Primeiro comentário:*', reminder.firstComment.trim())
  }

  if (reminder.extraInfo?.trim()) {
    partes.push('', `*Observação:* ${reminder.extraInfo.trim()}`)
  }

  if (reminder.mediaUrls.length > 1) {
    partes.push('', `${reminder.mediaUrls.length} imagens vão em seguida, na ordem.`)
  }

  partes.push('', `Ver na agenda: ${agendaLink(reminder.projectId)}`)

  return partes.join('\n')
}

/**
 * Envia o lembrete. Nunca lança — quem chama decide o que fazer com o false.
 *
 * Uma mídia só vai como imagem legendada (uma mensagem). Com várias, o texto
 * vai primeiro e as artes em seguida, para a ordem do carrossel ficar clara.
 *
 * @returns true se a mensagem principal saiu. Arte extra que falha é só logada:
 *   reenviar tudo na próxima rodada do cron duplicaria o lembrete.
 */
export async function sendPublishReminder(
  reminder: PublishReminder
): Promise<boolean> {
  try {
    if (!isEvolutionConfigured()) {
      console.warn(
        `[Lembretes] Post ${reminder.postId} não avisado — Evolution não configurada`
      )
      return false
    }

    const texto = buildReminderMessage(reminder)
    const [primeira, ...demais] = reminder.mediaUrls

    if (primeira && demais.length === 0) {
      return await sendWhatsAppMedia(primeira, { caption: texto })
    }

    const principalEnviada = await sendWhatsAppText(texto)
    if (!principalEnviada) return false

    for (const [index, url] of reminder.mediaUrls.entries()) {
      const enviada = await sendWhatsAppMedia(url, {
        caption: `${index + 1}/${reminder.mediaUrls.length}`,
      })
      if (!enviada) {
        console.error(
          `[Lembretes] Post ${reminder.postId}: arte ${index + 1}/${reminder.mediaUrls.length} não foi enviada (${url})`
        )
      }
    }

    return true
  } catch (error) {
    console.error(
      `[Lembretes] Falha inesperada ao avisar sobre o post ${reminder.postId}:`,
      error
    )
    return false
  }
}
