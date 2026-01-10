/**
 * Later Post Scheduler
 * Alternative scheduler using Later API instead of Zapier/Buffer
 */

import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { put } from '@vercel/blob'
import {
  Prisma,
  PostType,
  ScheduleType,
  RecurrenceFrequency,
  PostStatus,
  PostLogEvent,
  PublishType,
  VerificationStatus,
} from '../../../prisma/generated/client'
import { generateVerificationTag } from '@/lib/posts/verification/tag-generator'
import { getLaterClient } from '@/lib/later'
import type { InstagramContentType } from '@/lib/later/types'
import {
  LaterApiError,
  LaterMediaUploadError,
  LaterRateLimitError,
  isRateLimitError,
} from '@/lib/later/errors'
import { cropToInstagramFeed } from '@/lib/images/auto-crop'

interface RecurringConfig {
  frequency: RecurrenceFrequency
  daysOfWeek?: number[]
  time: string
  endDate?: string
}

interface CreatePostData {
  projectId: number
  userId: string
  generationId?: string
  postType: PostType
  caption: string
  mediaUrls: string[]
  blobPathnames?: string[]
  scheduleType: ScheduleType
  scheduledDatetime?: string
  recurringConfig?: RecurringConfig
  altText?: string[]
  firstComment?: string
  publishType?: PublishType
  reminderExtraInfo?: string
}

/**
 * Later Post Scheduler
 * Handles post creation and scheduling via Later API
 */
export class LaterPostScheduler {
  private laterClient = getLaterClient()

  private isVideoUrl(url: string) {
    return /\.(mp4|mov|avi|webm)(\?.*)?$/i.test(url)
  }

  private async normalizeMediaUrlsForFeed(post: {
    id: string
    userId: string
    postType: PostType
    mediaUrls: string[]
  }) {
    if (![PostType.POST, PostType.CAROUSEL].includes(post.postType)) {
      return { urls: post.mediaUrls, newPathnames: [] }
    }

    const normalizedUrls: string[] = []
    const newPathnames: string[] = []

    for (const [index, url] of post.mediaUrls.entries()) {
      if (this.isVideoUrl(url)) {
        normalizedUrls.push(url)
        continue
      }

      const alreadyNormalized =
        url.includes('/normalized/') && /\.(jpe?g)(\?.*)?$/i.test(url)
      if (alreadyNormalized) {
        normalizedUrls.push(url)
        continue
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch media ${index + 1} (${response.status})`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const croppedBuffer = await cropToInstagramFeed(buffer)
      const blob = await put(
        `posts/${post.userId}/normalized/${Date.now()}-${post.id}-${index + 1}.jpg`,
        croppedBuffer,
        {
          access: 'public',
          addRandomSuffix: true,
          contentType: 'image/jpeg',
        }
      )

      normalizedUrls.push(blob.url)
      newPathnames.push(blob.pathname)
    }

    return { urls: normalizedUrls, newPathnames }
  }

  /**
   * Create a new post using Later API
   */
  async createPost(data: CreatePostData) {
    // Validate post type and media count
    this.validatePost(data)

    // Note: Reminders work differently with Later - they're just scheduled posts
    // that users need to manually publish. We'll treat them as scheduled posts.

    // For IMMEDIATE posts, use current date/time
    const currentDateTime = new Date()
    const scheduledDatetime =
      data.scheduleType === ScheduleType.IMMEDIATE
        ? currentDateTime
        : data.scheduledDatetime
          ? new Date(data.scheduledDatetime)
          : null

    console.log('[Later Scheduler] Creating post with schedule type:', data.scheduleType)
    console.log('[Later Scheduler] Scheduled datetime:', scheduledDatetime)

    // Generate verification tag for stories
    let verificationTag: string | null = null
    if (data.postType === PostType.STORY) {
      // Tag will be generated after post creation (need post.id)
      console.log('[Later Scheduler] Story detected - verification tag will be generated')
    }

    // Create post in database with SCHEDULED status
    let post = await db.socialPost.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        generationId: data.generationId,
        postType: data.postType,
        caption: data.caption,
        mediaUrls: data.mediaUrls,
        blobPathnames: data.blobPathnames || [],
        altText: data.altText || [],
        firstComment: data.firstComment,
        publishType: data.publishType || PublishType.DIRECT,
        reminderExtraInfo: data.reminderExtraInfo,
        scheduleType: data.scheduleType,
        scheduledDatetime,
        recurringConfig: data.recurringConfig
          ? JSON.parse(JSON.stringify(data.recurringConfig))
          : null,
        status: PostStatus.SCHEDULED,
        originalScheduleType: data.scheduleType,
      },
    })

    // Generate verification tag for stories
    if (post.postType === PostType.STORY) {
      verificationTag = generateVerificationTag(post.id)

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

      console.log(`[Later Scheduler] Verification tag generated: ${verificationTag}`)
    }

    // Log creation
    await this.createLog(post.id, PostLogEvent.CREATED, 'Post criado via Later')

    // For IMMEDIATE posts, send to Later API now
    // For SCHEDULED posts, keep in database and send via cron job later
    if (data.scheduleType === ScheduleType.IMMEDIATE) {
      console.log('[Later Scheduler] 🚀 IMMEDIATE post - sending to Later API now')
      try {
        await this.sendToLater(post.id)
      } catch (error) {
        console.error('[Later Scheduler] Failed to send immediate post:', error)

        // Update status to FAILED
        await db.socialPost.update({
          where: { id: post.id },
          data: {
            status: PostStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            failedAt: new Date(),
          },
        })

        await this.createLog(
          post.id,
          PostLogEvent.FAILED,
          `Erro ao enviar para Later: ${error instanceof Error ? error.message : 'Unknown'}`
        )

        throw error
      }
    } else {
      console.log('[Later Scheduler] 📅 SCHEDULED post - keeping in database, will send via cron job')
      console.log(`[Later Scheduler] Scheduled for: ${scheduledDatetime?.toISOString()}`)

      await this.createLog(
        post.id,
        PostLogEvent.CREATED,
        `Post agendado para ${scheduledDatetime?.toISOString()} - será enviado via cron job`
      )
    }

    // If RECURRING, create series (handled separately)
    if (data.scheduleType === 'RECURRING') {
      console.log('[Later Scheduler] Recurring posts not yet implemented for Later')
      // TODO: Implement recurring series for Later in future
    }

    return { success: true, postId: post.id }
  }

  /**
   * Validate post data
   */
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

    // Validate media URLs are present
    if (data.mediaUrls.length === 0) {
      throw new Error('Pelo menos uma mídia é necessária')
    }
  }

  /**
   * Send post to Later API
   */
  async sendToLater(postId: string) {
    try {
      console.log(`[Later Scheduler] Starting sendToLater for post ${postId}`)

      // SOLUÇÃO 1: Lock distribuído com transação para evitar processamento duplo
      let post = await db.$transaction(async (tx) => {
        console.log(`[Later Scheduler] Transaction started for post ${postId}`)

        // Busca e lock pessimista do post
        const lockedPost = await tx.socialPost.findUnique({
          where: { id: postId },
          include: {
            Project: {
              select: {
                id: true,
                name: true,
                laterAccountId: true,
                laterProfileId: true,
                instagramAccountId: true,
                instagramUsername: true,
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

        if (!lockedPost) {
          throw new Error('Post não encontrado')
        }

        // Se já tem laterPostId, já foi enviado - skip
        if (lockedPost.laterPostId) {
          console.log(
            `[Later Scheduler] Post ${lockedPost.id} already sent to Later (${lockedPost.laterPostId}) - skipping duplicate send`
          )
          return null // Retorna null para indicar skip
        }

        // Se já está sendo processado, skip
        if (lockedPost.status === PostStatus.POSTING) {
          console.log(
            `[Later Scheduler] Post ${lockedPost.id} already in POSTING status - skipping to prevent duplicate`
          )
          return null // Retorna null para indicar skip
        }

        // Marca imediatamente como POSTING com timestamp de processamento
        const updatedPost = await tx.socialPost.update({
          where: { id: postId },
          data: {
            status: PostStatus.POSTING,
            processingStartedAt: new Date() // Campo agora existe em produção
          },
          include: {
            Project: {
              select: {
                id: true,
                name: true,
                laterAccountId: true,
                laterProfileId: true,
                instagramAccountId: true,
                instagramUsername: true,
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

        return updatedPost // Retorna o post atualizado com status POSTING e dados do Project
      }, {
        timeout: 10000 // 10 second timeout for transaction
      })

      console.log(`[Later Scheduler] Transaction completed, post status: ${post?.status}`)

      // Se o post foi skipado (null), retornar sucesso com flag skipped
      if (!post) {
        console.log(`[Later Scheduler] Post was skipped (already processing or sent)`)
        return { success: true, skipped: true }
      }

      const normalization = await this.normalizeMediaUrlsForFeed(post)
      if (normalization.newPathnames.length > 0) {
        const updatedPost = await db.socialPost.update({
          where: { id: post.id },
          data: {
            mediaUrls: normalization.urls,
            blobPathnames: {
              push: normalization.newPathnames,
            },
          },
        })

        post = {
          ...post,
          mediaUrls: updatedPost.mediaUrls,
        }
      }

      // Validate Later account is configured
      if (!post.Project.laterAccountId) {
        throw new Error(
          `Later account not configured for project "${post.Project.name}" (ID: ${post.projectId}). ` +
            `Please set laterAccountId in the project settings.`
        )
      }

      // Get post author for credit deduction
      const postAuthor = await db.user.findUnique({
        where: { id: post.userId },
        select: { clerkId: true },
      })

      if (!postAuthor?.clerkId) {
        throw new Error('Clerk user ID not found for post author')
      }

      console.log(`[Later Scheduler] Sending post ${post.id} to Later API`)
      console.log(`[Later Scheduler] Project: ${post.Project.name} (ID: ${post.projectId})`)
      console.log(`[Later Scheduler] Later Account ID: ${post.Project.laterAccountId}`)
      console.log(`[Later Scheduler] Instagram Username: ${post.Project.instagramUsername}`)

      // 1. Prepare media items with correct structure
      console.log(`[Later Scheduler] Preparing ${post.mediaUrls.length} media items`)
      const mediaItems = post.mediaUrls.map(url => {
        // Detect media type from URL
        const isVideo = url.toLowerCase().match(/\.(mp4|mov|avi|webm)/)
        return {
          type: (isVideo ? 'video' : 'image') as 'image' | 'video',
          url, // Use simple "url" field (not image_url or video_url)
        }
      })

      // 2. Prepare caption (with verification tag for stories)
      const captionWithTag =
        post.postType === PostType.STORY && post.verificationTag
          ? `${post.caption}\n\n${post.verificationTag}`
          : post.caption

      // 3. Map PostType to Instagram content type
      const contentType = this.mapPostTypeToLater(post.postType)
      console.log(`[Later Scheduler] Instagram contentType: ${contentType}`)

      // 4. Create post in Later - ALWAYS publish immediately
      // Scheduling is handled locally, Later just publishes when we call this
      console.log('[Later Scheduler] Creating post in Later (immediate publish)...')

      const payload = {
        content: captionWithTag,
        platforms: [
          {
            platform: 'instagram',
            accountId: post.Project.laterAccountId, // Later Account ID (unique per Instagram account)
            platformSpecificData: {
              contentType,
            },
          },
        ],
        // NO scheduledFor - always publish immediately
        publishNow: true, // Always true - scheduling done locally
      }
      let laterPost

      const useMediaUpload =
        process.env.LATER_MEDIA_UPLOAD === 'true' || process.env.LATER_MEDIA_UPLOAD === '1'

      if (useMediaUpload && (post.postType === PostType.CAROUSEL || post.postType === PostType.POST)) {
        console.log('[Later Scheduler] Uploading media to Later before creating post...')
        try {
          laterPost = await this.laterClient.createPostWithMedia(payload, post.mediaUrls)
        } catch (error) {
          if (
            error instanceof LaterMediaUploadError ||
            (error instanceof LaterApiError && [401, 403].includes(error.statusCode))
          ) {
            console.error('[Later Scheduler] Media upload failed, falling back to URL-based create:', error)
            payload.mediaItems = mediaItems
            console.log('[Later Scheduler] Full payload:', JSON.stringify(payload, null, 2))
            laterPost = await this.laterClient.createPost(payload)
          } else {
            throw error
          }
        }
      } else {
        if (!useMediaUpload && (post.postType === PostType.CAROUSEL || post.postType === PostType.POST)) {
          console.log('[Later Scheduler] Media upload disabled, using URL-based create for feed post')
        }
        payload.mediaItems = mediaItems
        console.log('[Later Scheduler] Full payload:', JSON.stringify(payload, null, 2))
        laterPost = await this.laterClient.createPost(payload)
      }

      console.log(`[Later Scheduler] Later post created: ${laterPost.id} (${laterPost.status})`)
      console.log(`[Later Scheduler] 🔍 Later API Response:`, {
        id: laterPost.id,
        status: laterPost.status,
        permalink: laterPost.permalink,
        platformPostId: laterPost.platformPostId,
        hasId: !!laterPost.id,
        idType: typeof laterPost.id,
      })

      // 6. Deduct credits AFTER successful post creation
      const organizationId =
        post.Project.organizationProjects?.[0]?.organization?.clerkOrgId
      console.log('[Later Scheduler] Deducting credits...')
      await deductCreditsForFeature({
        clerkUserId: postAuthor.clerkId,
        feature: 'social_media_post',
        details: {
          postId: post.id,
          postType: post.postType,
          projectId: post.projectId,
          laterPostId: laterPost.id,
        },
        organizationId,
        projectId: post.projectId,
      })

      // 7. Update post in database
      const newStatus =
        laterPost.status === 'published'
          ? PostStatus.POSTED
          : laterPost.status === 'failed'
            ? PostStatus.FAILED
            : PostStatus.POSTING

      console.log(`[Later Scheduler] 💾 Saving laterPostId to database:`, {
        postId: post.id,
        laterPostId: laterPost.id,
        newStatus,
      })

      const publishedAt =
        laterPost.status === 'published'
          ? new Date(laterPost.publishedAt || Date.now())
          : null

      const verificationUpdate =
        post.postType === PostType.STORY &&
        post.publishType === PublishType.DIRECT &&
        laterPost.status === 'published'
          ? {
              verificationStatus: VerificationStatus.VERIFIED,
              verificationAttempts: Math.max(post.verificationAttempts || 0, 1),
              verifiedByFallback: true,
              verifiedStoryId: laterPost.platformPostId || null,
              verifiedPermalink: laterPost.permalink || null,
              verifiedTimestamp: publishedAt || new Date(),
              lastVerificationAt: new Date(),
              nextVerificationAt: null,
              verificationError: null,
            }
          : {}

      try {
        const updatedPost = await db.socialPost.update({
          where: { id: post.id },
          data: {
            laterPostId: laterPost.id,
            status: newStatus,
            publishedUrl: laterPost.permalink || null,
            instagramMediaId: laterPost.platformPostId || null,
            lateStatus: laterPost.status,
            latePublishedAt: publishedAt,
            latePlatformUrl: laterPost.permalink || null,
            sentAt: publishedAt || null,
            lastSyncAt: new Date(),
            ...verificationUpdate,
          },
        })

        console.log(`[Later Scheduler] ✅ Database updated successfully`)
        console.log(`[Later Scheduler] 🔍 Verify save:`, {
          savedLaterPostId: updatedPost.laterPostId,
          matches: updatedPost.laterPostId === laterPost.id,
        })
      } catch (updateError) {
        console.error(`[Later Scheduler] ❌❌❌ DATABASE UPDATE FAILED:`, updateError)
        throw updateError
      }

      // 8. Create log
      const logMessage = 'Post enviado para Later - publicação imediata'

      await this.createLog(post.id, PostLogEvent.SENT, logMessage, {
        laterPostId: laterPost.id,
        laterStatus: laterPost.status,
      })

      console.log(`[Later Scheduler] ✅ Post ${post.id} processed successfully`)

      return { success: true, laterPostId: laterPost.id }
    } catch (error) {
      console.error(`[Later Scheduler] ❌ Error sending post ${postId}:`, error)

      // Handle rate limit errors
      if (isRateLimitError(error)) {
        const rateLimitError = error as LaterRateLimitError
        console.error(
          `[Later Scheduler] Rate limit exceeded. Retry after ${rateLimitError.retryAfterSeconds}s`
        )

        // Update post with retry info
        await db.socialPost.update({
          where: { id: postId },
          data: {
            status: PostStatus.FAILED,
            errorMessage: `Rate limit exceeded. Retry after ${rateLimitError.retryAfterSeconds} seconds.`,
            failedAt: new Date(),
          },
        })

        await this.createLog(
          postId,
          PostLogEvent.FAILED,
          `Later API rate limit exceeded - retry after ${rateLimitError.retryAfterSeconds}s`,
          {
            rateLimitInfo: rateLimitError.rateLimitInfo,
          }
        )
      } else if (error instanceof LaterApiError) {
        // Handle Later API errors
        let userFriendlyMessage = error.message

        // Detect aspect ratio errors and provide helpful message
        if (error.message.includes('Aspect ratio') || error.message.includes('aspect ratio')) {
          const aspectRatioMatch = error.message.match(/Aspect ratio ([0-9.]+):1/)
          const currentAspectRatio = aspectRatioMatch ? aspectRatioMatch[1] : 'desconhecido'

          // Get post type to provide specific guidance
          const post = await db.socialPost.findUnique({
            where: { id: postId },
            select: { postType: true },
          })

          if (post?.postType === PostType.POST) {
            userFriendlyMessage = `❌ Formato de imagem incompatível com POST de feed\n\n` +
              `Sua imagem tem aspect ratio ${currentAspectRatio}:1, mas posts de feed no Instagram aceitam apenas de 0.75:1 (4:5 retrato) até 1.91:1 (paisagem).\n\n` +
              `💡 Dica: Sua imagem parece estar em formato vertical de Story (9:16). Para postar no feed:\n` +
              `1️⃣ Use o tipo "POST" apenas para imagens entre 4:5 e 1.91:1\n` +
              `2️⃣ OU recorte a imagem para formato 4:5 (retrato) ou 1:1 (quadrado)\n` +
              `3️⃣ OU mude o tipo de post para "STORY" ou "REEL" se quiser manter o formato vertical`
          } else if (post?.postType === PostType.CAROUSEL) {
            userFriendlyMessage = `❌ Formato de imagem incompatível com CAROUSEL\n\n` +
              `Sua imagem tem aspect ratio ${currentAspectRatio}:1, mas carrosséis no Instagram aceitam apenas de 0.75:1 (4:5 retrato) até 1.91:1 (paisagem).\n\n` +
              `💡 Todas as imagens do carrossel devem ter aspect ratio entre 4:5 e 1.91:1.`
          }
        }

        await db.socialPost.update({
          where: { id: postId },
          data: {
            status: PostStatus.FAILED,
            errorMessage: userFriendlyMessage,
            failedAt: new Date(),
          },
        })

        await this.createLog(
          postId,
          PostLogEvent.FAILED,
          `Later API error: ${userFriendlyMessage}`,
          {
            statusCode: error.statusCode,
            errorCode: error.errorCode,
            originalError: error.message,
          }
        )
      } else {
        // Generic error handling
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
          `Error: ${error instanceof Error ? error.message : 'Unknown'}`
        )
      }

      throw error
    }
  }

  /**
   * Upload media files to Later
   * Returns array of Later media IDs
   */
  private async uploadMediaToLater(mediaUrls: string[]): Promise<string[]> {
    const mediaIds: string[] = []

    for (const url of mediaUrls) {
      console.log(`[Later Scheduler] Uploading media: ${url}`)

      try {
        const upload = await this.laterClient.uploadMediaFromUrl(url)
        mediaIds.push(upload.id)

        console.log(
          `[Later Scheduler] Media uploaded: ${upload.id} (${upload.type})`
        )
      } catch (error) {
        console.error(`[Later Scheduler] Failed to upload media ${url}:`, error)
        throw new Error(
          `Failed to upload media: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    return mediaIds
  }

  /**
   * Map PostType to Later Instagram content type
   */
  private mapPostTypeToLater(postType: PostType): InstagramContentType {
    switch (postType) {
      case PostType.STORY:
        return 'story'
      case PostType.REEL:
        return 'reel'
      case PostType.CAROUSEL:
        return 'carousel'
      case PostType.POST:
      default:
        return 'post'
    }
  }

  /**
   * Create log entry for post
   */
  private async createLog(
    postId: string,
    event: PostLogEvent,
    message: string,
    metadata?: unknown
  ) {
    await db.postLog.create({
      data: {
        postId,
        event,
        message,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    })
  }
}
