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
    return this.getLaterScheduler().createPost(data)
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
   * Check for posts stuck in POSTING status for more than 10 minutes
   * and mark them as FAILED
   */
  async checkStuckPosts() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

    // Find posts that have been in POSTING status for more than 10 minutes
    const stuckPosts = await db.socialPost.findMany({
      where: {
        status: PostStatus.POSTING,
        laterPostId: null,
        updatedAt: {
          lt: tenMinutesAgo,
        },
      },
    })

    if (stuckPosts.length === 0) {
      console.log('✅ No stuck posts found')
      return { updated: 0 }
    }

    console.log(`⚠️ Found ${stuckPosts.length} stuck posts, updating to FAILED...`)

    // Update all stuck posts to FAILED
    const result = await db.socialPost.updateMany({
      where: {
        id: {
          in: stuckPosts.map((p) => p.id),
        },
      },
      data: {
        status: PostStatus.FAILED,
        errorMessage: 'Post travado em POSTING por mais de 10 minutos - criação no Late não confirmada',
        failedAt: new Date(),
      },
    })

    // Create logs for each stuck post
    await Promise.all(
      stuckPosts.map((post) =>
        this.createLog(
          post.id,
          PostLogEvent.FAILED,
          'Post travado em POSTING - marcado como FAILED automaticamente (Late)'
        )
      )
    )

    console.log(`✅ Updated ${result.count} stuck posts to FAILED`)
    return { updated: result.count }
  }
}
