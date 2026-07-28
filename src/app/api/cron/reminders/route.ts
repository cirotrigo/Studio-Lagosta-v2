/**
 * Cron de lembretes de publicação manual.
 * Roda a cada 5 minutos e avisa no WhatsApp 5 a 10 minutos antes do horário.
 *
 * Até julho/2026 isto disparava um webhook por projeto (todos apontavam para o
 * mesmo n8n). Agora manda direto pela Evolution — ver `reminder-notifier.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PostStatus, PublishType } from '../../../../../prisma/generated/client'
import {
  notifyPostFailure,
  withFailureNotificationBatch,
} from '@/lib/notifications/post-failure-notifier'
import { sendPublishReminder } from '@/lib/notifications/reminder-notifier'

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

    console.log(`[Reminders] 🔍 Looking for posts scheduled between:`)
    console.log(`[Reminders]    ${fiveMinutesFromNow.toISOString()} and ${tenMinutesFromNow.toISOString()}`)

    // Find posts that:
    // 1. Have publishType = REMINDER
    // 2. Are SCHEDULED status
    // 3. Scheduled time is between 5-10 minutes from now (window for 5min cron)
    // 4. Haven't sent reminder yet (reminderSentAt = null)
    const postsNeedingReminder = await db.socialPost.findMany({
      where: {
        publishType: PublishType.REMINDER,
        status: PostStatus.SCHEDULED,
        scheduledDatetime: {
          gte: fiveMinutesFromNow,
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
      orderBy: { scheduledDatetime: 'asc' }
    })

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
        console.log(
          `📤 [Reminders] Avisando sobre o post ${post.id} (${post.Project.name}, ${post.mediaUrls.length} mídia(s))`
        )

        const enviado = await sendPublishReminder({
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
