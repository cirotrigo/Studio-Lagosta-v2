/**
 * Cron job for sending webhook reminders
 * Runs every 5 minutes
 * Sends webhooks 5 minutes before scheduled time for manual publishing
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PostStatus, PublishType } from '../../../../../prisma/generated/client'
import {
  notifyPostFailure,
  withFailureNotificationBatch,
} from '@/lib/notifications/post-failure-notifier'

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
            webhookReminderUrl: true,
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
            Project: { select: { name: true, webhookReminderUrl: true } }
          }
        })

        if (nextReminder) {
          const minutesUntil = Math.round((nextReminder.scheduledDatetime!.getTime() - now.getTime()) / 60000)
          console.log(`[Reminders] ⏳ Next reminder scheduled for: ${nextReminder.scheduledDatetime?.toISOString()}`)
          console.log(`[Reminders]    Project: ${nextReminder.Project.name}`)
          console.log(`[Reminders]    Minutes until: ${minutesUntil}`)
          console.log(`[Reminders]    Webhook configured: ${nextReminder.Project.webhookReminderUrl ? 'YES' : 'NO ⚠️'}`)
        }
      }

      return NextResponse.json({ success: true, sent: 0, pending: allReminderPosts })
    }

    console.log(`📬 [Reminders] Sending ${postsNeedingReminder.length} reminder(s)...`)

    let sent = 0
    let failed = 0

    // Agrupa os avisos da rodada numa mensagem só no grupo do WhatsApp
    await withFailureNotificationBatch(async () => {
      for (const post of postsNeedingReminder) {
        // Skip if project doesn't have webhook configured
        if (!post.Project.webhookReminderUrl) {
          console.warn(`⚠️ [Reminders] Post ${post.id} - Project ${post.Project.name} has no webhook URL configured`)
          await notifyPostFailure({
            postId: post.id,
            projectId: post.Project.id,
            projectName: post.Project.name,
            postType: post.postType,
            scheduledFor: post.scheduledDatetime,
            reason: 'O projeto não tem canal de aviso configurado',
            attempts: 1,
            kind: 'LEMBRETE',
          })
          continue
        }

        try {
          // Prepare webhook payload
          const payload = {
            type: 'reminder',
            post: {
              id: post.id,
              content: post.caption,
              scheduledFor: post.scheduledDatetime?.toISOString(),
              platform: 'instagram',
              postType: post.postType,
              mediaUrls: post.mediaUrls,
              extraInfo: post.reminderExtraInfo || null,
              firstComment: post.firstComment || null
            },
            project: {
              id: post.Project.id,
              name: post.Project.name,
              instagramUsername: post.Project.instagramUsername
            }
          }

          // Send webhook
          console.log(`📤 [Reminders] Sending webhook to: ${post.Project.webhookReminderUrl}`)
          console.log(`📦 [Reminders] Payload:`, JSON.stringify(payload, null, 2))

          const response = await fetch(post.Project.webhookReminderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Studio-Lagosta-Reminders/1.0'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000) // 10s timeout
          })

          console.log(`📥 [Reminders] Webhook response status: ${response.status}`)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ [Reminders] Webhook error response:`, errorText)
            throw new Error(`Webhook returned ${response.status}: ${response.statusText}`)
          }

          // Mark reminder as sent
          console.log(`💾 [Reminders] Updating reminderSentAt for post ${post.id}`)
          await db.socialPost.update({
            where: { id: post.id },
            data: { reminderSentAt: new Date() }
          })
          console.log(`✅ [Reminders] reminderSentAt updated successfully`)

          sent++
          console.log(`✅ [Reminders] Sent reminder for post ${post.id} (${post.Project.name})`)

        } catch (error) {
          console.error(`❌ [Reminders] Failed to send reminder for post ${post.id}:`, error)
          failed++

          await notifyPostFailure({
            postId: post.id,
            projectId: post.Project.id,
            projectName: post.Project.name,
            postType: post.postType,
            scheduledFor: post.scheduledDatetime,
            reason: error instanceof Error ? error.message : 'Erro desconhecido',
            attempts: 1,
            kind: 'LEMBRETE',
          })

          // Don't mark as sent if it failed - will retry next cron run
        }
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
