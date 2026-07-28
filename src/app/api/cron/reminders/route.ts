/**
 * Cron de lembretes de publicação manual.
 * Roda a cada 5 minutos e avisa no WhatsApp 5 a 10 minutos antes do horário.
 *
 * Até julho/2026 isto disparava um webhook por projeto (todos apontavam para o
 * mesmo n8n). Agora manda direto pela Evolution — ver `reminder-notifier.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PostLogEvent, PostStatus, PublishType } from '../../../../../prisma/generated/client'
import {
  notifyPostFailure,
  withFailureNotificationBatch,
} from '@/lib/notifications/post-failure-notifier'
import { sendPublishReminder } from '@/lib/notifications/reminder-notifier'

/** Até quanto tempo depois do horário ainda vale avisar. */
const CATCH_UP_WINDOW_MS = 2 * 60 * 60 * 1000

/** Teto por rodada, para uma fila represada não virar enxurrada no grupo. */
const MAX_POR_RODADA = 20

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    console.log(`[Reminders] ⏰ Cron started at: ${now.toISOString()}`)

    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000)
    // Lembrete criado com menos de 5 minutos de antecedência nunca caía na
    // janela [+5min, +10min] e ficava SCHEDULED para sempre — foi assim que 5
    // posts sumiram em silêncio entre janeiro e maio de 2026. A varredura
    // abaixo recolhe também o que está vencido há pouco.
    const catchUpFloor = new Date(now.getTime() - CATCH_UP_WINDOW_MS)

    console.log(`[Reminders] 🔍 Janela: ${catchUpFloor.toISOString()} até ${tenMinutesFromNow.toISOString()}`)

    // Find posts that:
    // 1. Have publishType = REMINDER
    // 2. Are SCHEDULED status
    // 3. Estão até 10 min à frente OU vencidos há no máximo CATCH_UP_WINDOW_MS
    // 4. Haven't sent reminder yet (reminderSentAt = null)
    const postsNeedingReminder = await db.socialPost.findMany({
      where: {
        publishType: PublishType.REMINDER,
        status: PostStatus.SCHEDULED,
        scheduledDatetime: {
          gte: catchUpFloor,
          lte: tenMinutesFromNow
        },
        reminderSentAt: null
      },
      include: {
        Project: {
          select: {
            id: true,
            name: true,
            instagramUsername: true
          }
        }
      },
      orderBy: { scheduledDatetime: 'asc' },
      take: MAX_POR_RODADA
    })

    // Vencidos além da janela de recuperação não são avisados — mandar lembrete
    // de ontem só polui o grupo. Mas ficam no log em vez de sumirem calados.
    const perdidos = await db.socialPost.count({
      where: {
        publishType: PublishType.REMINDER,
        status: PostStatus.SCHEDULED,
        scheduledDatetime: { lt: catchUpFloor },
        reminderSentAt: null
      }
    })
    if (perdidos > 0) {
      console.warn(
        `[Reminders] ⚠️ ${perdidos} lembrete(s) vencido(s) há mais de ${CATCH_UP_WINDOW_MS / 60000} min não serão avisados — fora da janela de recuperação`
      )
    }

    if (postsNeedingReminder.length === 0) {
      // Diagnostic: Count all scheduled reminder posts to help debug
      const allReminderPosts = await db.socialPost.count({
        where: {
          publishType: PublishType.REMINDER,
          status: PostStatus.SCHEDULED,
          reminderSentAt: null
        }
      })

      console.log(`[Reminders] ✅ No reminders in current window (5-10 min from now)`)
      console.log(`[Reminders] 📊 Total pending reminder posts in DB: ${allReminderPosts}`)

      // If there are pending reminders, show when the next one is scheduled
      if (allReminderPosts > 0) {
        const nextReminder = await db.socialPost.findFirst({
          where: {
            publishType: PublishType.REMINDER,
            status: PostStatus.SCHEDULED,
            reminderSentAt: null,
            scheduledDatetime: { gte: now }
          },
          orderBy: { scheduledDatetime: 'asc' },
          select: {
            id: true,
            scheduledDatetime: true,
            Project: { select: { name: true } }
          }
        })

        if (nextReminder) {
          const minutesUntil = Math.round((nextReminder.scheduledDatetime!.getTime() - now.getTime()) / 60000)
          console.log(`[Reminders] ⏳ Next reminder scheduled for: ${nextReminder.scheduledDatetime?.toISOString()}`)
          console.log(`[Reminders]    Project: ${nextReminder.Project.name}`)
          console.log(`[Reminders]    Minutes until: ${minutesUntil}`)
        }
      }

      return NextResponse.json({ success: true, sent: 0, pending: allReminderPosts })
    }

    console.log(`📬 [Reminders] Sending ${postsNeedingReminder.length} reminder(s)...`)

    let sent = 0
    let failed = 0

    // Agrupa os avisos de falha da rodada numa mensagem só. Os lembretes em si
    // saem um a um — cada um leva a própria arte.
    await withFailureNotificationBatch(async () => {
      for (const post of postsNeedingReminder) {
        // Fora da janela normal: ou nasceu em cima da hora, ou o cron atrasou.
        const atrasado =
          !post.scheduledDatetime || post.scheduledDatetime < fiveMinutesFromNow

        console.log(
          `📤 [Reminders] Avisando sobre o post ${post.id} (${post.Project.name}, ${post.mediaUrls.length} mídia(s))${atrasado ? ' [ATRASADO]' : ''}`
        )

        const enviado = await sendPublishReminder({
          late: atrasado,
          postId: post.id,
          projectId: post.Project.id,
          projectName: post.Project.name,
          instagramUsername: post.Project.instagramUsername,
          postType: post.postType,
          scheduledFor: post.scheduledDatetime,
          caption: post.caption,
          mediaUrls: post.mediaUrls,
          extraInfo: post.reminderExtraInfo,
          firstComment: post.firstComment,
        })

        if (!enviado) {
          failed++
          console.error(`❌ [Reminders] Lembrete do post ${post.id} não foi enviado`)

          // O post continua elegível por até CATCH_UP_WINDOW_MS, então sem esta
          // trava a mesma falha viraria um aviso a cada 5 minutos por 2 horas.
          // O log fica sempre (rastro no histórico do post); o aviso, uma vez.
          const jaAvisado = await db.postLog.findFirst({
            where: {
              postId: post.id,
              event: PostLogEvent.FAILED,
              createdAt: { gte: catchUpFloor },
            },
            select: { id: true },
          })

          await db.postLog.create({
            data: {
              postId: post.id,
              event: PostLogEvent.FAILED,
              message: 'Lembrete não pôde ser enviado pelo WhatsApp',
            },
          })

          if (!jaAvisado) {
            // Aviso no grupo faz sentido quando a falha é deste post (mídia fora
            // do ar, por exemplo). Se a Evolution inteira estiver caída, este
            // aviso também não sai — e aí só resta o log.
            await notifyPostFailure({
              postId: post.id,
              projectId: post.Project.id,
              projectName: post.Project.name,
              postType: post.postType,
              scheduledFor: post.scheduledDatetime,
              reason: 'A Evolution não aceitou o envio do lembrete',
              attempts: 1,
              kind: 'LEMBRETE',
            })
          }

          // Sem reminderSentAt: a próxima rodada tenta de novo enquanto o post
          // continuar dentro da janela.
          continue
        }

        await db.socialPost.update({
          where: { id: post.id },
          data: { reminderSentAt: new Date() }
        })

        sent++
        console.log(`✅ [Reminders] Lembrete enviado para o post ${post.id} (${post.Project.name})`)
      }
    })

    console.log(`✅ [Reminders] Complete: ${sent} sent, ${failed} failed`)

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: postsNeedingReminder.length
    })

  } catch (error) {
    console.error('[Reminders] Cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
