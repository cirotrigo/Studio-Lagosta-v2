import { db } from '@/lib/db'
import { PostScheduler } from './scheduler'
import { PostStatus, RetryStatus, PostLogEvent } from '../../../prisma/generated/client'
import { getLaterClient } from '@/lib/later/client'

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
      const postsInWindow = await db.socialPost.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          scheduledDatetime: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        include: {
          Project: {
            select: {
              id: true,
              name: true,
              postingProvider: true,
            },
          },
        },
      })

      // CATCH-UP: Find overdue posts (scheduled in the past but not sent)
      // Limit to last 6 hours to avoid processing very old posts
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
      const overduePosts = await db.socialPost.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          scheduledDatetime: {
            gte: sixHoursAgo,
            lt: windowStart, // Before the current window
          },
        },
        include: {
          Project: {
            select: {
              id: true,
              name: true,
              postingProvider: true,
            },
          },
        },
        take: 5, // Process max 5 overdue posts per execution
        orderBy: {
          scheduledDatetime: 'asc', // Oldest first
        },
      })

      // Combine both lists
      const postsToSend = [...postsInWindow, ...overduePosts]

      if (postsToSend.length === 0) {
        return { processed: 0, catchUp: 0 }
      }

      if (overduePosts.length > 0) {
        console.log(`⏰ CATCH-UP: Encontrados ${overduePosts.length} posts atrasados`)
      }
      console.log(`📨 Total de ${postsToSend.length} posts para enviar (${postsInWindow.length} na janela, ${overduePosts.length} atrasados)`)

      let successCount = 0
      let failureCount = 0
      let catchUpCount = 0

      // Send each post
      for (const post of postsToSend) {
        const isOverdue = post.scheduledDatetime < windowStart
        if (isOverdue) {
          catchUpCount++
          console.log(`⏰ Processando post atrasado: ${post.id} (agendado para ${post.scheduledDatetime.toISOString()})`)
        }

        try {
          // Route to appropriate scheduler based on posting provider
          if (post.Project.postingProvider === 'LATER') {
            console.log(`📤 Sending Later post ${post.id} to Later API...`)
            await this.scheduler.sendToLater(post.id)
          } else {
            console.log(`📤 Sending Zapier post ${post.id} to Zapier...`)
            await this.scheduler.sendToZapier(post.id)
          }
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

      console.log(`✅ Enviados: ${successCount} | ❌ Falhas: ${failureCount} | ⏰ Catch-up: ${catchUpCount}`)

      return {
        processed: postsToSend.length,
        success: successCount,
        failed: failureCount,
        catchUp: catchUpCount
      }
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
          post: {
            include: {
              Project: {
                select: {
                  id: true,
                  name: true,
                  postingProvider: true,
                },
              },
            },
          },
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

          // Try to send again - route to appropriate scheduler
          if (retry.post.Project.postingProvider === 'LATER') {
            console.log(`🔄 Retrying Later post ${retry.postId}...`)
            await this.scheduler.sendToLater(retry.postId)
          } else {
            console.log(`🔄 Retrying Zapier post ${retry.postId}...`)
            await this.scheduler.sendToZapier(retry.postId)
          }

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

  /**
   * Sync Late post status (fallback for webhook)
   * Runs every 1 HOUR as backup
   */
  async syncLateStatus() {
    const laterClient = getLaterClient()

    // Find posts with laterPostId that haven't been finalized
    const postsToSync = await db.socialPost.findMany({
      where: {
        laterPostId: { not: null },
        status: { in: [PostStatus.SCHEDULED, PostStatus.POSTING] },
        OR: [
          { lastSyncAt: null }, // Never synced
          { lastSyncAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } } // >30min (fallback)
        ]
      },
      take: 50, // Max 50 per run (rate limit)
      orderBy: { scheduledDatetime: 'desc' }
    })

    if (postsToSync.length === 0) {
      console.log('✅ [Late Sync] No posts to sync')
      return { synced: 0, updated: 0, failed: 0 }
    }

    console.log(`🔄 [Late Sync] Syncing ${postsToSync.length} posts (fallback)...`)

    let updated = 0
    let failed = 0

    for (const post of postsToSync) {
      try {
        // Query status from Late
        const laterPost = await laterClient.getPost(post.laterPostId!)

        // Update local status
        const wasUpdated = await this.updateFromLateStatus(post.id, laterPost)
        if (wasUpdated) updated++

      } catch (error: any) {
        console.error(`❌ [Late Sync] Failed to sync post ${post.id}:`, error)
        failed++

        // Handle rate limit
        if (error.statusCode === 429) {
          const resetTime = error.rateLimitInfo?.reset
          console.warn(`⚠️ [Late Sync] Rate limit exceeded. Reset at: ${resetTime}`)
          break // Stop execution
        }
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`✅ [Late Sync] Complete: ${updated} updated, ${failed} failed`)

    return { synced: postsToSync.length, updated, failed }
  }

  /**
   * Update post from Late status
   * Returns true if status changed
   */
  private async updateFromLateStatus(
    postId: string,
    laterPost: any
  ): Promise<boolean> {
    const currentPost = await db.socialPost.findUnique({
      where: { id: postId },
      select: { status: true, lateStatus: true }
    })

    if (!currentPost) return false

    const updateData: any = {
      lateStatus: laterPost.status,
      lastSyncAt: new Date()
    }

    let statusChanged = false

    // Map Late status → Local status
    switch (laterPost.status) {
      case 'scheduled':
        // Keep current status
        break

      case 'publishing':
        if (currentPost.status !== PostStatus.POSTING) {
          updateData.status = PostStatus.POSTING
          statusChanged = true
        }
        break

      case 'published':
        if (currentPost.status !== PostStatus.POSTED) {
          updateData.status = PostStatus.POSTED
          updateData.latePublishedAt = new Date(laterPost.publishedAt)
          updateData.sentAt = new Date(laterPost.publishedAt)
          statusChanged = true

          // Extract Instagram URL
          const igPlatform = laterPost.platforms?.find(
            (p: any) => p.platform === 'instagram'
          )
          if (igPlatform?.platformPostUrl) {
            updateData.latePlatformUrl = igPlatform.platformPostUrl
          }

          // Create success log
          await db.postLog.create({
            data: {
              postId,
              event: PostLogEvent.SENT,
              message: 'Post published via Late (detected by sync)',
              metadata: {
                laterPostId: laterPost.id,
                publishedAt: laterPost.publishedAt,
                platformUrl: igPlatform?.platformPostUrl
              }
            }
          })
        }
        break

      case 'failed':
      case 'partial':
        if (currentPost.status !== PostStatus.FAILED) {
          updateData.status = PostStatus.FAILED
          updateData.failedAt = new Date()
          updateData.errorMessage = laterPost.error || 'Failed via Late API'
          statusChanged = true

          // Create error log
          await db.postLog.create({
            data: {
              postId,
              event: PostLogEvent.FAILED,
              message: `Failed detected via Late: ${laterPost.error || 'Unknown'}`,
              metadata: { laterPostId: laterPost.id, laterError: laterPost.error }
            }
          })
        }
        break
    }

    // Update DB
    await db.socialPost.update({
      where: { id: postId },
      data: updateData
    })

    return statusChanged
  }
}
