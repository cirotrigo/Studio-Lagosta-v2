import { db } from '@/lib/db'
import {
  Prisma,
  PostType,
  ScheduleType,
  RecurrenceFrequency,
  PostStatus,
  PostLogEvent,
  PublishType,
} from '../../../prisma/generated/client'
import { LaterPostScheduler } from './later-scheduler'

interface RecurringConfig {
  frequency: RecurrenceFrequency
  daysOfWeek?: number[]
  time: string
  endDate?: string
}

interface CreatePostData {
  projectId: number
  userId: string
  generationId?: string // Optional now
  postType: PostType
  caption: string
  mediaUrls: string[]
  blobPathnames?: string[] // For cleanup
  scheduleType: ScheduleType
  scheduledDatetime?: string
  recurringConfig?: RecurringConfig
  altText?: string[]
  firstComment?: string
  publishType?: PublishType
  reminderExtraInfo?: string
  // Template-based scheduling (Stories only)
  pageId?: string
  templateId?: number
  slotValues?: Record<string, unknown>
}

export class PostScheduler {
  private laterScheduler: LaterPostScheduler | null = null

  /**
   * Get or create LaterPostScheduler instance (lazy loading)
   */
  private getLaterScheduler(): LaterPostScheduler {
    if (!this.laterScheduler) {
      this.laterScheduler = new LaterPostScheduler()
    }
    return this.laterScheduler
  }

  async createPost(data: CreatePostData) {
    console.log('[PostScheduler] ====================================')
    console.log('[PostScheduler] 📝 Creating post via Later scheduler')
    console.log('[PostScheduler] Post type:', data.postType)
    console.log('[PostScheduler] Schedule type:', data.scheduleType)
    console.log('[PostScheduler] Media URLs count:', data.mediaUrls.length)
    console.log('[PostScheduler] ====================================')

    const result = await this.getLaterScheduler().createPost(data)

    console.log('[PostScheduler] ====================================')
    console.log('[PostScheduler] ✅ Post creation completed')
    console.log('[PostScheduler] Result:', JSON.stringify(result))
    console.log('[PostScheduler] ====================================')

    return result
  }

  /**
   * Send an existing post to Later API
   * Used by cron job to send scheduled posts
   */
  async sendToLater(postId: string) {
    return this.getLaterScheduler().sendToLater(postId)
  }

  async scheduleRetry(postId: string, attemptNumber: number = 1) {
    // Schedule retry for 5 minutes from now
    const scheduledFor = new Date(Date.now() + 5 * 60 * 1000)

    await db.postRetry.create({
      data: {
        postId,
        attemptNumber,
        scheduledFor,
        status: 'PENDING',
      },
    })
  }

  async createLog(postId: string, event: PostLogEvent, message: string, metadata?: unknown) {
    await db.postLog.create({
      data: {
        postId,
        event,
        message,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    })
  }

  /**
   * Mark posts as FAILED when:
   *   (a) POSTING for 30+ min with no laterPostId (never reached Zernio), OR
   *   (b) POSTING/SCHEDULED past their time + 30 min grace with a laterPostId
   *       that no longer resolves on Zernio (Zernio dropped the post).
   * Case (b) is the silent-failure path: Zernio deletes failed/expired drafts
   * and our sync cron only imports scheduled/published, so these posts would
   * otherwise stay stuck forever.
   */
  async checkStuckPosts() {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

    // Case (a): POSTING without laterPostId — never sent to Zernio
    const stuckPosts = await db.socialPost.findMany({
      where: {
        status: PostStatus.POSTING,
        laterPostId: null,
        OR: [
          { processingStartedAt: { lt: thirtyMinutesAgo } },
          { processingStartedAt: null, updatedAt: { lt: thirtyMinutesAgo } },
        ],
      },
    })

    // Case (b): orphaned laterPostId — present locally, gone on Zernio.
    // Use scheduledDatetime OR processingStartedAt — IMMEDIATE posts may have a near-future
    // scheduledDatetime (set to "now" at creation) or none, so we'd miss them otherwise.
    const orphanCandidates = await db.socialPost.findMany({
      where: {
        laterPostId: { not: null },
        status: { in: [PostStatus.POSTING, PostStatus.SCHEDULED] },
        OR: [
          { scheduledDatetime: { lt: thirtyMinutesAgo } },
          { processingStartedAt: { lt: thirtyMinutesAgo } },
          {
            processingStartedAt: null,
            scheduledDatetime: null,
            updatedAt: { lt: thirtyMinutesAgo },
          },
        ],
      },
      select: { id: true, laterPostId: true, scheduledDatetime: true },
    })

    const orphans: string[] = []
    if (orphanCandidates.length > 0) {
      const { getLaterClient } = await import('@/lib/later')
      const { LaterNotFoundError } = await import('@/lib/later/errors')
      const client = getLaterClient()
      for (const candidate of orphanCandidates) {
        try {
          await client.getPost(candidate.laterPostId!)
        } catch (err) {
          if (err instanceof LaterNotFoundError) {
            orphans.push(candidate.id)
          }
        }
      }
    }

    if (stuckPosts.length === 0 && orphans.length === 0) {
      console.log('✅ No stuck posts found')
      return { updated: 0 }
    }

    let updatedCount = 0

    if (stuckPosts.length > 0) {
      const ids = stuckPosts.map((p) => p.id)
      const result = await db.socialPost.updateMany({
        where: { id: { in: ids } },
        data: {
          status: PostStatus.FAILED,
          errorMessage: 'Post travado em POSTING por mais de 30 minutos - criação no Zernio não confirmada',
          failedAt: new Date(),
        },
      })
      updatedCount += result.count
      await Promise.all(
        stuckPosts.map((post) =>
          this.createLog(
            post.id,
            PostLogEvent.FAILED,
            'Post travado em POSTING por 30+ minutos - marcado como FAILED automaticamente'
          )
        )
      )
    }

    if (orphans.length > 0) {
      const result = await db.socialPost.updateMany({
        where: { id: { in: orphans } },
        data: {
          status: PostStatus.FAILED,
          errorMessage: 'Post no Zernio não encontrado (404) após prazo agendado - provavelmente falhou ou foi removido',
          failedAt: new Date(),
        },
      })
      updatedCount += result.count
      await Promise.all(
        orphans.map((id) =>
          this.createLog(
            id,
            PostLogEvent.FAILED,
            'laterPostId não encontrado no Zernio após prazo - marcado como FAILED'
          )
        )
      )
    }

    console.log(`✅ Updated ${updatedCount} stuck posts to FAILED (direct: ${stuckPosts.length}, orphans: ${orphans.length})`)
    return { updated: updatedCount }
  }
}
