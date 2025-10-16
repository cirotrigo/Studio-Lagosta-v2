import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import {
  PostType,
  ScheduleType,
  RecurrenceFrequency,
  PostStatus,
  PostLogEvent
} from '../../../prisma/generated/client'

interface RecurringConfig {
  frequency: RecurrenceFrequency
  daysOfWeek?: number[]
  time: string
  endDate?: string
}

interface CreatePostData {
  projectId: number
  userId: string
  generationId: string
  postType: PostType
  caption: string
  mediaUrls: string[]
  scheduleType: ScheduleType
  scheduledDatetime?: string
  recurringConfig?: RecurringConfig
  altText?: string[]
  firstComment?: string
}

export class PostScheduler {
  private zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL || ''

  async createPost(data: CreatePostData) {
    // Validate post type and media count
    this.validatePost(data)

    // Create post in database
    const post = await db.socialPost.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        generationId: data.generationId,
        postType: data.postType,
        caption: data.caption,
        mediaUrls: data.mediaUrls,
        altText: data.altText || [],
        firstComment: data.firstComment,
        scheduleType: data.scheduleType,
        scheduledDatetime: data.scheduledDatetime
          ? new Date(data.scheduledDatetime)
          : null,
        recurringConfig: data.recurringConfig ? JSON.parse(JSON.stringify(data.recurringConfig)) : null,
        status: data.scheduleType === 'IMMEDIATE' ? PostStatus.PROCESSING : PostStatus.SCHEDULED,
        originalScheduleType: data.scheduleType,
        zapierWebhookUrl: this.zapierWebhookUrl,
      },
    })

    // Log creation
    await this.createLog(post.id, PostLogEvent.CREATED, 'Post criado')

    // Process based on schedule type
    if (data.scheduleType === 'IMMEDIATE') {
      // Post immediately
      await this.sendToZapier(post.id)
    } else if (data.scheduleType === 'RECURRING') {
      // Create recurring series
      await this.createRecurringSeries(post)
    }
    // If SCHEDULED, the cron job will process it

    return { success: true, postId: post.id }
  }

  validatePost(data: CreatePostData) {
    // Validate media count
    if (data.postType === 'CAROUSEL') {
      if (data.mediaUrls.length < 2 || data.mediaUrls.length > 10) {
        throw new Error('Carrossel deve ter entre 2 e 10 imagens')
      }
    } else if (['STORY', 'REEL'].includes(data.postType)) {
      if (data.mediaUrls.length !== 1) {
        throw new Error(`${data.postType} deve ter exatamente 1 mídia`)
      }
    }

    // Validate scheduled time is in the future
    if (data.scheduleType === 'SCHEDULED' && data.scheduledDatetime) {
      const scheduledTime = new Date(data.scheduledDatetime)
      if (scheduledTime <= new Date()) {
        throw new Error('Data/hora deve ser no futuro')
      }
    }
  }

  async sendToZapier(postId: string) {
    try {
      const post = await db.socialPost.findUnique({
        where: { id: postId },
        include: {
          Project: {
            select: {
              name: true,
              instagramAccountId: true,
              instagramUsername: true,
            },
          },
        },
      })

      if (!post) {
        throw new Error('Post não encontrado')
      }

      // Validate that the project has Instagram configured
      if (!post.Project.instagramAccountId) {
        throw new Error('Instagram account not configured for this project')
      }

      // Payload for Zapier (always immediate posting)
      const payload = {
        // Post data
        post_type: post.postType.toLowerCase(),
        caption: post.caption,
        media_urls: post.mediaUrls,
        alt_text: post.altText,
        first_comment: post.firstComment || '',

        // INSTAGRAM ACCOUNT IDENTIFICATION
        instagram_account_id: post.Project.instagramAccountId,
        instagram_username: post.Project.instagramUsername,

        // Metadata
        metadata: {
          post_id: post.id,
          project_id: post.projectId,
          project_name: post.Project.name,
          user_id: post.userId,
        },
      }

      console.log(`🚀 Enviando post ${post.id} para Zapier...`)

      // Deduct credits BEFORE sending
      await deductCreditsForFeature({
        clerkUserId: post.userId,
        feature: 'social_media_post',
        details: {
          postId: post.id,
          postType: post.postType,
          projectId: post.projectId,
        },
      })

      // Send webhook
      const response = await fetch(this.zapierWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Zapier retornou erro: ${response.status}`)
      }

      const webhookResponse = await response.json()

      // Update status
      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.SENT,
          sentAt: new Date(),
          webhookResponse,
        },
      })

      await this.createLog(post.id, PostLogEvent.SENT, 'Post enviado com sucesso')

      console.log(`✅ Post ${post.id} enviado com sucesso!`)

      return { success: true }
    } catch (error) {
      console.error(`❌ Erro ao enviar post ${postId}:`, error)

      // Update error status
      await db.socialPost.update({
        where: { id: postId },
        data: {
          status: PostStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date(),
        },
      })

      await this.createLog(
        postId,
        PostLogEvent.FAILED,
        `Erro ao enviar: ${error instanceof Error ? error.message : 'Unknown'}`
      )

      // Schedule retry
      await this.scheduleRetry(postId)

      throw error
    }
  }

  async createRecurringSeries(parentPost: any) {
    const { recurringConfig } = parentPost
    if (!recurringConfig) return

    const occurrences = this.generateOccurrences(
      recurringConfig.frequency,
      recurringConfig.time,
      recurringConfig.daysOfWeek,
      recurringConfig.endDate
    )

    // Create child posts for each occurrence
    for (const occurrence of occurrences) {
      await db.socialPost.create({
        data: {
          parentPostId: parentPost.id,
          projectId: parentPost.projectId,
          userId: parentPost.userId,
          generationId: parentPost.generationId,
          postType: parentPost.postType,
          caption: parentPost.caption,
          mediaUrls: parentPost.mediaUrls,
          altText: parentPost.altText,
          firstComment: parentPost.firstComment,
          scheduleType: ScheduleType.SCHEDULED,
          scheduledDatetime: occurrence,
          status: PostStatus.SCHEDULED,
          isRecurring: true,
          originalScheduleType: ScheduleType.RECURRING,
          zapierWebhookUrl: parentPost.zapierWebhookUrl,
        },
      })
    }

    console.log(`🔄 Série recorrente criada: ${occurrences.length} posts agendados`)
  }

  generateOccurrences(
    frequency: RecurrenceFrequency,
    time: string,
    daysOfWeek?: number[],
    endDate?: string
  ): Date[] {
    const occurrences: Date[] = []
    const [hours, minutes] = time.split(':').map(Number)
    const startDate = new Date()
    const maxDate = endDate
      ? new Date(endDate)
      : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year

    let currentDate = new Date(startDate)

    while (currentDate <= maxDate && occurrences.length < 365) {
      if (frequency === RecurrenceFrequency.DAILY) {
        const occurrenceDate = new Date(currentDate)
        occurrenceDate.setHours(hours, minutes, 0, 0)
        if (occurrenceDate > startDate) {
          occurrences.push(occurrenceDate)
        }
        currentDate.setDate(currentDate.getDate() + 1)
      } else if (frequency === RecurrenceFrequency.WEEKLY && daysOfWeek) {
        if (daysOfWeek.includes(currentDate.getDay())) {
          const occurrenceDate = new Date(currentDate)
          occurrenceDate.setHours(hours, minutes, 0, 0)
          if (occurrenceDate > startDate) {
            occurrences.push(occurrenceDate)
          }
        }
        currentDate.setDate(currentDate.getDate() + 1)
      } else if (frequency === RecurrenceFrequency.MONTHLY) {
        const occurrenceDate = new Date(currentDate)
        occurrenceDate.setDate(1) // First day of month
        occurrenceDate.setHours(hours, minutes, 0, 0)
        if (occurrenceDate > startDate) {
          occurrences.push(occurrenceDate)
        }
        currentDate.setMonth(currentDate.getMonth() + 1)
      }
    }

    return occurrences
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

  async createLog(postId: string, event: PostLogEvent, message: string, metadata?: any) {
    await db.postLog.create({
      data: {
        postId,
        event,
        message,
        metadata,
      },
    })
  }
}
