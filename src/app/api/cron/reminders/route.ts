/**
 * Cron job for sending webhook reminders
 * Runs every 5 minutes
 * Sends webhooks 5 minutes before scheduled time for manual publishing
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PostStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000)

    // Find posts that:
    // 1. Have publishType = REMINDER
    // 2. Are SCHEDULED status
    // 3. Scheduled time is between 5-10 minutes from now (window for 5min cron)
    // 4. Haven't sent reminder yet (reminderSentAt = null)
    const postsNeedingReminder = await db.socialPost.findMany({
      where: {
        publishType: 'REMINDER',
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
      console.log('✅ [Reminders] No reminders to send')
      return NextResponse.json({ success: true, sent: 0 })
    }

    console.log(`📬 [Reminders] Sending ${postsNeedingReminder.length} reminder(s)...`)

    let sent = 0
    let failed = 0

    for (const post of postsNeedingReminder) {
      // Skip if project doesn't have webhook configured
      if (!post.Project.webhookReminderUrl) {
        console.warn(`⚠️ [Reminders] Post ${post.id} - Project ${post.Project.name} has no webhook URL configured`)
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

        // Don't mark as sent if it failed - will retry next cron run
      }
    }

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
