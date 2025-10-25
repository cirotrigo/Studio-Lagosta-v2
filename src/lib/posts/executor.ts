import { db } from '@/lib/db'
import { PostScheduler } from './scheduler'
import { PostStatus, RetryStatus } from '../../../prisma/generated/client'

export class PostExecutor {
  private scheduler: PostScheduler

  constructor() {
    this.scheduler = new PostScheduler()
  }

  async executeScheduledPosts() {
    try {
      const now = new Date()
      const windowStart = new Date(now.getTime() - 60000) // -1 minute
      const windowEnd = new Date(now.getTime() + 60000) // +1 minute

      // Find posts scheduled for this time window
      const postsToSend = await db.socialPost.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          scheduledDatetime: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
      })

      if (postsToSend.length === 0) {
        return { processed: 0 }
      }

      console.log(`📨 Encontrados ${postsToSend.length} posts para enviar`)

      let successCount = 0
      let failureCount = 0

      // Send each post
      for (const post of postsToSend) {
        try {
          await this.scheduler.sendToZapier(post.id)
          successCount++
        } catch (error) {
          console.error(`❌ Erro ao enviar post ${post.id}:`, error)
          failureCount++

          // Don't schedule retry if it's an insufficient credits error
          const isInsufficientCredits = error instanceof Error && error.name === 'InsufficientCreditsError'
          if (isInsufficientCredits) {
            console.log(`💳 Post ${post.id} failed due to insufficient credits - retry already skipped by scheduler`)
          }
        }
      }

      console.log(`✅ Enviados: ${successCount} | ❌ Falhas: ${failureCount}`)

      return { processed: postsToSend.length, success: successCount, failed: failureCount }
    } catch (error) {
      console.error('Erro no cron job:', error)
      throw error
    }
  }

  async executeRetries() {
    try {
      const now = new Date()

      // Find pending retries
      const retries = await db.postRetry.findMany({
        where: {
          status: RetryStatus.PENDING,
          scheduledFor: {
            lte: now,
          },
        },
        include: {
          post: true,
        },
      })

      if (retries.length === 0) {
        return { processed: 0 }
      }

      console.log(`🔄 Executando ${retries.length} retries...`)

      for (const retry of retries) {
        try {
          // Update retry status
          await db.postRetry.update({
            where: { id: retry.id },
            data: { status: RetryStatus.PROCESSING, executedAt: new Date() },
          })

          // Try to send again
          await this.scheduler.sendToZapier(retry.postId)

          // Mark retry as success
          await db.postRetry.update({
            where: { id: retry.id },
            data: { status: RetryStatus.SUCCESS },
          })
        } catch (error) {
          console.error(`❌ Retry ${retry.id} (attempt ${retry.attemptNumber}) failed:`, error)

          // Mark retry as failed
          await db.postRetry.update({
            where: { id: retry.id },
            data: {
              status: RetryStatus.FAILED,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            },
          })

          // Schedule next retry ONLY if:
          // 1. Still has attempts left (max 3 attempts)
          // 2. Error is NOT InsufficientCreditsError (no point retrying)
          const isInsufficientCredits = error instanceof Error && error.name === 'InsufficientCreditsError'

          if (retry.attemptNumber < 3 && !isInsufficientCredits) {
            await this.scheduler.scheduleRetry(retry.postId, retry.attemptNumber + 1)
            console.log(`🔄 Scheduled retry ${retry.attemptNumber + 1}/3 for post ${retry.postId}`)
          } else if (isInsufficientCredits) {
            console.log(`💳 Post ${retry.postId} failed due to insufficient credits - not retrying`)
          } else {
            console.log(`⚠️ Post ${retry.postId} exceeded max retries (3)`)
          }
        }
      }

      return { processed: retries.length }
    } catch (error) {
      console.error('Erro ao executar retries:', error)
      throw error
    }
  }
}
