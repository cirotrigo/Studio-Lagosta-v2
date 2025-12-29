import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import {
  Prisma,
  PostType,
  ScheduleType,
  RecurrenceFrequency,
  PostStatus,
  PostLogEvent,
  PublishType,
  VerificationStatus,
  PostingProvider
} from '../../../prisma/generated/client'
import { appendTagToCaption, generateVerificationTag } from '@/lib/posts/verification/tag-generator'
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
}

export class PostScheduler {
  private globalZapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL || ''
  private laterScheduler: LaterPostScheduler | null = null

  /**
   * Get or create LaterPostScheduler instance (lazy loading)
   * Returns null if Later is not configured properly
   */
  private getLaterScheduler(): LaterPostScheduler | null {
    if (!this.laterScheduler) {
      try {
        this.laterScheduler = new LaterPostScheduler()
      } catch (error) {
        console.error('[PostScheduler] Failed to initialize LaterPostScheduler:', error)
        console.error('[PostScheduler] Later API is not properly configured. Posts will fall back to Zapier.')
        return null
      }
    }
    return this.laterScheduler
  }

  async createPost(data: CreatePostData) {
    // ============================================================
    // DUAL-MODE ROUTING: Later vs Zapier/Buffer
    // ============================================================

    // Fetch project to determine posting provider
    const project = await db.project.findUnique({
      where: { id: data.projectId },
      select: {
        id: true,
        name: true,
        postingProvider: true,
        laterAccountId: true,
      },
    })

    if (!project) {
      throw new Error(`Project not found: ${data.projectId}`)
    }

    // Route to Later if configured
    if (project.postingProvider === PostingProvider.LATER) {
      console.log(`📤 [Dual-Mode Router] Using Later API for project "${project.name}"`)

      const laterScheduler = this.getLaterScheduler()
      if (!laterScheduler) {
        console.warn(
          `⚠️ [Dual-Mode Router] Later is not configured. Falling back to Zapier for project "${project.name}"`
        )
        return this.createPostViaZapier(data)
      }

      return laterScheduler.createPost(data)
    }

    // Default to Zapier/Buffer
    console.log(`📤 [Dual-Mode Router] Using Zapier/Buffer for project "${project.name}"`)
    return this.createPostViaZapier(data)
  }

  /**
   * Create post via Zapier/Buffer (legacy method)
   * Renamed from createPost to make routing explicit
   */
  private async createPostViaZapier(data: CreatePostData) {
    // Validate post type and media count
    this.validatePost(data)

    // For IMMEDIATE posts, use current date/time
    const currentDateTime = new Date()
    const scheduledDatetime =
      data.scheduleType === ScheduleType.IMMEDIATE
        ? currentDateTime
        : data.scheduledDatetime
          ? new Date(data.scheduledDatetime)
          : null

    console.log('📅 Creating post with schedule type:', data.scheduleType)
    console.log('📅 Scheduled datetime:', scheduledDatetime)

    // Create post in database
    let post = await db.socialPost.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        generationId: data.generationId, // Can be undefined
        postType: data.postType,
        caption: data.caption,
        mediaUrls: data.mediaUrls,
        blobPathnames: data.blobPathnames || [], // Save pathnames for cleanup
        altText: data.altText || [],
        firstComment: data.firstComment,
        publishType: data.publishType || PublishType.DIRECT,
        scheduleType: data.scheduleType,
        scheduledDatetime,
        recurringConfig: data.recurringConfig ? JSON.parse(JSON.stringify(data.recurringConfig)) : null,
        status: data.scheduleType === 'IMMEDIATE' ? PostStatus.POSTING : PostStatus.SCHEDULED,
        originalScheduleType: data.scheduleType,
        // zapierWebhookUrl will be set when sending to Zapier
      },
    })

    if (post.postType === PostType.STORY) {
      const verificationTag = generateVerificationTag(post.id)

      post = await db.socialPost.update({
        where: { id: post.id },
        data: {
          verificationTag,
          verificationStatus: VerificationStatus.PENDING,
          verificationAttempts: 0,
          nextVerificationAt: null,
          lastVerificationAt: null,
          verifiedByFallback: false,
          verificationError: null,
          verifiedStoryId: null,
          verifiedPermalink: null,
          verifiedTimestamp: null,
        },
      })
    }

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
      const post = await db.socialPost.findUnique({
        where: { id: postId },
        include: {
          Project: {
            select: {
              id: true,
              name: true,
              instagramAccountId: true,
              instagramUsername: true,
              zapierWebhookUrl: true,
              organizationProjects: {
                select: {
                  organization: {
                    select: {
                      clerkOrgId: true,
                    },
                  },
                },
                take: 1,
              },
            },
          },
        },
      })

      if (!post) {
        throw new Error('Post não encontrado')
      }

      // Determine which webhook URL to use: project-specific or global fallback
      const webhookUrl = post.Project.zapierWebhookUrl || this.globalZapierWebhookUrl

      if (!webhookUrl) {
        throw new Error(
          `No webhook URL configured for project "${post.Project.name}" (ID: ${post.projectId}) ` +
          `and no global ZAPIER_WEBHOOK_URL found in environment variables`
        )
      }

      // Instagram account ID is sent to Buffer for identification
      // Buffer will validate and return error if needed

      const postAuthor = await db.user.findUnique({
        where: { id: post.userId },
        select: { clerkId: true },
      })

      if (!postAuthor?.clerkId) {
        throw new Error('Clerk user ID not found for post author')
      }

      // Safety net: ensure stories always have a verification tag before sending
      let verificationTag = post.verificationTag
      if (post.postType === PostType.STORY && !verificationTag) {
        verificationTag = generateVerificationTag(post.id)
        await db.socialPost.update({
          where: { id: post.id },
          data: {
            verificationTag,
            verificationStatus: VerificationStatus.PENDING,
            verificationAttempts: 0,
            nextVerificationAt: null,
            lastVerificationAt: null,
            verifiedByFallback: false,
            verificationError: null,
            verifiedStoryId: null,
            verifiedPermalink: null,
            verifiedTimestamp: null,
          },
        })
      }

      const captionWithVerificationTag =
        post.postType === PostType.STORY && verificationTag
          ? appendTagToCaption(post.caption, verificationTag)
          : post.caption

      if (post.postType === PostType.STORY && !post.verificationTag) {
        console.warn('[Verification] Story post without verificationTag', post.id)
      }

      // Detect media type based on URL and count
      const detectMediaType = (urls: string[]): string => {
        if (urls.length > 1) {
          return 'multiple_images'
        }

        const url = urls[0].toLowerCase()
        const isVideo = url.includes('.mp4') ||
                       url.includes('.mov') ||
                       url.includes('.avi') ||
                       url.includes('video') ||
                       url.includes('.webm')

        return isVideo ? 'video' : 'image'
      }

      const mediaType = detectMediaType(post.mediaUrls)

      // Map post types to Buffer format
      const bufferPostType = post.postType.toLowerCase() === 'reel' ? 'reels' : post.postType.toLowerCase()

      // Prepare carousel URLs (always send 10 variables, empty if not used)
      const carouselUrls: Record<string, string> = {}
      if (mediaType === 'multiple_images') {
        for (let i = 1; i <= 10; i++) {
          carouselUrls[`url${i}`] = post.mediaUrls[i - 1] || ''
        }
      }

      // Payload for Zapier (always immediate posting)
      const payload = {
        // Post data
        post_type: bufferPostType, // post, reels, story
        media_type: mediaType, // image, video, multiple_images
        caption: captionWithVerificationTag,
        media_urls: post.mediaUrls, // Keep original array for backward compatibility
        media_count: post.mediaUrls.length,
        alt_text: post.altText,
        first_comment: post.firstComment || '',
        publish_type: post.publishType.toLowerCase(), // direct or reminder
        tags: verificationTag ? [verificationTag] : [],

        // Carousel URLs (url1 to url10) - only populated for multiple_images
        ...carouselUrls,

        // INSTAGRAM ACCOUNT IDENTIFICATION
        instagram_account_id: post.Project.instagramAccountId,
        instagram_username: post.Project.instagramUsername,

        // Metadata
        metadata: {
          studio_post_id: post.id, // ⭐ For Buffer confirmation webhook
          post_id: post.id,
          project_id: post.projectId,
          project_name: post.Project.name,
          user_id: post.userId,
          created_at: post.createdAt.toISOString(),
          verification_tag: verificationTag || null,
        },
      }

      console.log(`🚀 Enviando post ${post.id} para webhook...`)
      console.log(`📍 Webhook URL: ${webhookUrl.substring(0, 50)}...`)
      console.log(`📦 Project: ${post.Project.name} (ID: ${post.projectId})`)
      console.log('📦 Payload:', JSON.stringify(payload, null, 2))

      // Deduct credits BEFORE sending
      const organizationId = post.Project.organizationProjects?.[0]?.organization?.clerkOrgId
      console.log('[SCHEDULER] Organization ID:', organizationId)
      await deductCreditsForFeature({
        clerkUserId: postAuthor.clerkId,
        feature: 'social_media_post',
        details: {
          postId: post.id,
          postType: post.postType,
          projectId: post.projectId,
        },
        organizationId,
        projectId: post.projectId,
      })

      // Send webhook
      const response = await fetch(webhookUrl, {
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

      // Update status to POSTING (waiting for Buffer confirmation)
      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.POSTING, // ⭐ Will be updated to POSTED by confirmation webhook
          webhookResponse: webhookResponse as Prisma.InputJsonValue,
          zapierWebhookUrl: webhookUrl, // Record which webhook was used
        },
      })

      await this.createLog(post.id, PostLogEvent.SENT, 'Post enviado para Buffer - aguardando confirmação')

      console.log(`✅ Post ${post.id} enviado para Buffer com sucesso! Aguardando confirmação de publicação...`)

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

      // Only schedule retry if it's NOT an insufficient credits error
      // (no point retrying if user has no credits)
      const isInsufficientCredits = error instanceof Error && error.name === 'InsufficientCreditsError'
      if (!isInsufficientCredits) {
        await this.scheduleRetry(postId)
        console.log(`🔄 Retry scheduled for post ${postId}`)
      } else {
        console.log(`💳 Post ${postId} failed due to insufficient credits - not scheduling retry`)
      }

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
    // Note: zapierWebhookUrl will be determined at send time based on project config
    for (const occurrence of occurrences) {
      const childPost = await db.socialPost.create({
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
        },
      })

      if (post.postType === PostType.STORY) {
        const verificationTag = generateVerificationTag(childPost.id)

        await db.socialPost.update({
          where: { id: childPost.id },
          data: {
            verificationTag,
            verificationStatus: VerificationStatus.PENDING,
            verificationAttempts: 0,
            nextVerificationAt: null,
            lastVerificationAt: null,
            verifiedByFallback: false,
            verificationError: null,
            verifiedStoryId: null,
            verifiedPermalink: null,
            verifiedTimestamp: null,
          },
        })
      }
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
        errorMessage: 'Post travado em POSTING por mais de 10 minutos - webhook de confirmação não recebido',
        failedAt: new Date(),
      },
    })

    // Create logs for each stuck post
    await Promise.all(
      stuckPosts.map((post) =>
        this.createLog(
          post.id,
          PostLogEvent.FAILED,
          'Post travado em POSTING - marcado como FAILED automaticamente'
        )
      )
    )

    console.log(`✅ Updated ${result.count} stuck posts to FAILED`)
    return { updated: result.count }
  }
}
