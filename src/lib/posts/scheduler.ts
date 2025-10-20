import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import {
  PostType,
  ScheduleType,
  RecurrenceFrequency,
  PostStatus,
  PostLogEvent,
  PublishType
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
  publishType?: PublishType
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
        publishType: data.publishType || PublishType.DIRECT,
        scheduleType: data.scheduleType,
        scheduledDatetime:
          data.scheduleType === ScheduleType.IMMEDIATE
            ? new Date()
            : data.scheduledDatetime
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
      // Post immediately, but don't block response if webhook falhar
      try {
        await this.sendToZapier(post.id)
      } catch (error) {
        console.error('⚠️ Falha ao enviar post imediato, será reprocessado pelo sistema de retries.', error)
      }
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
      if (!this.zapierWebhookUrl) {
        throw new Error('Zapier webhook URL (ZAPIER_WEBHOOK_URL) não está configurada')
      }

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

      const postAuthor = await db.user.findUnique({
        where: { id: post.userId },
        select: { clerkId: true },
      })

      if (!postAuthor?.clerkId) {
        throw new Error('Clerk user ID not found for post author')
      }

      // Detect media type based on URL and count
      const detectMediaType = (urls: string[]): string => {
        if (urls.length > 1) {
          return 'CAROUSEL_ALBUM'
        }

        const url = urls[0].toLowerCase()
        const isVideo = url.includes('.mp4') ||
                       url.includes('.mov') ||
                       url.includes('.avi') ||
                       url.includes('video') ||
                       url.includes('.webm')

        return isVideo ? 'VIDEO' : 'IMAGE'
      }

      const mediaType = detectMediaType(post.mediaUrls)

      // Map post types to Buffer format
      const bufferPostType = post.postType.toLowerCase() === 'reel' ? 'reels' : post.postType.toLowerCase()

      // Payload for Zapier (always immediate posting)
      const payload = {
        // Post data
        post_type: bufferPostType, // post, reels, story
        media_type: mediaType, // IMAGE, VIDEO, CAROUSEL_ALBUM
        caption: post.caption,
        media_urls: post.mediaUrls,
        media_count: post.mediaUrls.length,
        alt_text: post.altText,
        first_comment: post.firstComment || '',
        publish_type: post.publishType.toLowerCase(), // direct or reminder

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
        clerkUserId: postAuthor.clerkId,
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

      let webhookResponse: string | object | null = null
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        webhookResponse = await response.json()
      } else {
        webhookResponse = await response.text()
      }

      // Update status
      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.SENT,
          sentAt: new Date(),
          webhookResponse: webhookResponse as any,
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

  async createRecurringSeries(parentPost: unknown) {
    const post = parentPost as {
      id: string
      projectId: number
      userId: string
      generationId: string
      postType: PostType
      caption: string
      mediaUrls: string[]
      altText: string[]
      firstComment: string | null
      zapierWebhookUrl: string
      recurringConfig: {
        frequency: RecurrenceFrequency
        time: string
        daysOfWeek?: number[]
        endDate?: string
      } | null
    }

    const { recurringConfig } = post
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
          parentPostId: post.id,
          projectId: post.projectId,
          userId: post.userId,
          generationId: post.generationId,
          postType: post.postType,
          caption: post.caption,
          mediaUrls: post.mediaUrls,
          altText: post.altText,
          firstComment: post.firstComment,
          scheduleType: ScheduleType.SCHEDULED,
          scheduledDatetime: occurrence,
          status: PostStatus.SCHEDULED,
          isRecurring: true,
          originalScheduleType: ScheduleType.RECURRING,
          zapierWebhookUrl: post.zapierWebhookUrl,
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

    const currentDate = new Date(startDate)

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

  async createLog(postId: string, event: PostLogEvent, message: string, metadata?: unknown) {
    await db.postLog.create({
      data: {
        postId,
        event,
        message,
        metadata: metadata as any,
      },
    })
  }
}
