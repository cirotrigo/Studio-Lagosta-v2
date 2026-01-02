/**
 * Late API Webhook Handler
 * Receives real-time status updates from Late API
 * Documentation: https://docs.getlate.dev/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import {
  PostLogEvent,
  PostStatus,
  PostType,
  PublishType,
  VerificationStatus,
} from '@prisma/client'
import { INITIAL_VERIFICATION_DELAY_MINUTES } from '@/lib/posts/verification/story-verifier'
import crypto from 'crypto'

/**
 * Verify webhook signature for security
 * Late uses HMAC SHA-256 with X-Late-Signature header
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  // If no secret configured, log warning but allow (development only)
  if (!secret) {
    console.warn('[Late Webhook] ⚠️ LATE_WEBHOOK_SECRET not configured - webhook verification disabled')
    return true
  }

  if (!signature) {
    console.error('[Late Webhook] Missing X-Late-Signature header')
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(payload).digest('hex')

    // Compare signatures securely
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    )
  } catch (error) {
    console.error('[Late Webhook] Signature verification failed:', error)
    return false
  }
}

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60 * 1000)

/**
 * Webhook POST handler
 * Processes events from Late API
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers()
    const signature = headersList.get('x-late-signature')

    const payload = await req.text()
    const secret = process.env.LATE_WEBHOOK_SECRET || ''

    // Verify authenticity
    if (!verifyWebhookSignature(payload, signature, secret)) {
      console.error('[Late Webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(payload)

    console.log(`[Late Webhook] Received: ${event.type}`, event.data?.postId)

    // Process events
    switch (event.type) {
      case 'post.scheduled':
        await handlePostScheduled(event.data)
        break

      case 'post.published':
        await handlePostPublished(event.data)
        break

      case 'post.failed':
        await handlePostFailed(event.data)
        break

      case 'post.partial':
        await handlePartialPublish(event.data)
        break

      case 'account.disconnected':
        await handleAccountDisconnected(event.data)
        break

      case 'post.analytics_updated':
        await handleAnalyticsUpdated(event.data)
        break

      default:
        console.log(`[Late Webhook] Unknown event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('[Late Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

/**
 * Post published successfully
 * Payload based on confirmed structure (getlate.dev/twitter-api)
 */
async function handlePostPublished(data: {
  post: {
    _id: string // MongoDB style ID
    status: 'published'
    platforms: Array<{
      platform: string
      accountId: { _id: string; username: string }
      status: string
      platformPostId?: string
      platformPostUrl?: string
    }>
    publishedAt: string
  }
}) {
  console.log('[Late Webhook] Processing post.published:', data.post._id)

  // Find post by laterPostId (stores the _id from Late)
  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.post._id }
  })

  if (!post) {
    console.warn(`[Late Webhook] Post not found: ${data.post._id}`)
    return
  }

  // Extract Instagram platform data
  const igPlatform = data.post.platforms?.find(p => p.platform === 'instagram')
  const publishedAt = new Date(data.post.publishedAt)

  const verificationData =
    post.postType === PostType.STORY && post.publishType === PublishType.DIRECT
      ? {
          verificationStatus: VerificationStatus.PENDING,
          verificationAttempts: 0,
          nextVerificationAt: addMinutes(publishedAt, INITIAL_VERIFICATION_DELAY_MINUTES),
          lastVerificationAt: null,
          verificationError: null,
          verifiedByFallback: false,
          verifiedStoryId: null,
          verifiedPermalink: null,
          verifiedTimestamp: null,
        }
      : post.postType === PostType.STORY && post.publishType === PublishType.REMINDER
      ? {
          verificationStatus: VerificationStatus.SKIPPED,
        }
      : {}

  // Update post status
  await db.socialPost.update({
    where: { id: post.id },
    data: {
      status: PostStatus.POSTED,
      lateStatus: 'published',
      latePublishedAt: publishedAt,
      latePlatformUrl: igPlatform?.platformPostUrl || null,
      publishedUrl: igPlatform?.platformPostUrl || null,
      instagramMediaId: igPlatform?.platformPostId || null,
      sentAt: publishedAt,
      lastSyncAt: new Date(),
      ...verificationData,
    }
  })

  // Create success log
  await db.postLog.create({
    data: {
      postId: post.id,
      event: PostLogEvent.SENT,
      message: 'Post published via Late (webhook)',
      metadata: {
        laterPostId: data.post._id,
        publishedAt: data.post.publishedAt,
        platformPostId: igPlatform?.platformPostId,
        platformUrl: igPlatform?.platformPostUrl
      }
    }
  })

  console.log(`✅ [Late Webhook] Post ${post.id} marked as published`)

  // TODO: Notify user (email, push notification, etc)
}

/**
 * Post failed
 * Payload based on confirmed structure
 */
async function handlePostFailed(data: {
  post: {
    _id: string
    status: 'failed'
    error?: string
    platforms: Array<{
      platform: string
      status: string
      error?: string
    }>
  }
}) {
  console.log('[Late Webhook] Processing post.failed:', data.post._id)

  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.post._id }
  })

  if (!post) {
    console.warn(`[Late Webhook] Post not found: ${data.post._id}`)
    return
  }

  // Extract Instagram error if available
  const igPlatform = data.post.platforms?.find(p => p.platform === 'instagram')
  const errorMessage = igPlatform?.error || data.post.error || 'Failed via Late API'

  await db.socialPost.update({
    where: { id: post.id },
    data: {
      status: PostStatus.FAILED,
      lateStatus: 'failed',
      errorMessage: errorMessage,
      failedAt: new Date(),
      lastSyncAt: new Date()
    }
  })

  // Create error log
  await db.postLog.create({
    data: {
      postId: post.id,
      event: PostLogEvent.FAILED,
      message: `Post failed: ${errorMessage}`,
      metadata: {
        laterPostId: data.post._id,
        error: errorMessage,
        platformStatus: igPlatform?.status
      }
    }
  })

  console.log(`❌ [Late Webhook] Post ${post.id} marked as failed`)

  // TODO: Notify user about failure
}

/**
 * Post scheduled (audit log)
 */
async function handlePostScheduled(data: {
  post: {
    _id: string
    scheduledFor?: string
  }
}) {
  console.log('[Late Webhook] Processing post.scheduled:', data.post._id)

  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.post._id }
  })

  if (!post) {
    console.warn(`[Late Webhook] Post not found: ${data.post._id}`)
    return
  }

  // Create audit log
  await db.postLog.create({
    data: {
      postId: post.id,
      event: PostLogEvent.SCHEDULED,
      message: 'Post scheduled in Late',
      metadata: {
        laterPostId: data.post._id,
        scheduledFor: data.post.scheduledFor
      }
    }
  })

  console.log(`📅 [Late Webhook] Post ${post.id} scheduled logged`)
}

/**
 * Partial publish (some platforms succeeded, others failed)
 */
async function handlePartialPublish(data: {
  post: {
    _id: string
    status: 'partial'
    platforms: Array<{
      platform: string
      status: 'published' | 'failed'
      error?: string
      platformPostId?: string
      platformPostUrl?: string
    }>
  }
}) {
  console.log('[Late Webhook] Processing post.partial:', data.post._id)

  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.post._id }
  })

  if (!post) {
    console.warn(`[Late Webhook] Post not found: ${data.post._id}`)
    return
  }

  const igPlatform = data.post.platforms?.find(p => p.platform === 'instagram')
  const publishedAt = new Date()

  const verificationData =
    post.postType === PostType.STORY && post.publishType === PublishType.DIRECT
      ? {
          verificationStatus: VerificationStatus.PENDING,
          verificationAttempts: 0,
          nextVerificationAt: addMinutes(publishedAt, INITIAL_VERIFICATION_DELAY_MINUTES),
          lastVerificationAt: null,
          verificationError: null,
          verifiedByFallback: false,
          verifiedStoryId: null,
          verifiedPermalink: null,
          verifiedTimestamp: null,
        }
      : post.postType === PostType.STORY && post.publishType === PublishType.REMINDER
      ? {
          verificationStatus: VerificationStatus.SKIPPED,
        }
      : {}

  // If Instagram succeeded, mark as POSTED
  if (igPlatform?.status === 'published') {
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        status: PostStatus.POSTED,
        lateStatus: 'partial',
        latePublishedAt: publishedAt,
        latePlatformUrl: igPlatform.platformPostUrl || null,
        publishedUrl: igPlatform.platformPostUrl || null,
        instagramMediaId: igPlatform.platformPostId || null,
        sentAt: publishedAt,
        lastSyncAt: new Date(),
        ...verificationData,
      }
    })

    await db.postLog.create({
      data: {
        postId: post.id,
        event: PostLogEvent.SENT,
        message: 'Instagram published (partial success)',
        metadata: {
          laterPostId: data.post._id,
          platformUrl: igPlatform.platformPostUrl,
          otherPlatformsFailed: true
        }
      }
    })

    console.log(`⚠️ [Late Webhook] Post ${post.id} partially published (Instagram OK)`)
  } else {
    // If Instagram failed, mark as FAILED
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        status: PostStatus.FAILED,
        lateStatus: 'partial',
        errorMessage: igPlatform?.error || 'Instagram failed in partial publish',
        failedAt: new Date(),
        lastSyncAt: new Date()
      }
    })

    await db.postLog.create({
      data: {
        postId: post.id,
        event: PostLogEvent.FAILED,
        message: 'Instagram failed in partial publish',
        metadata: {
          laterPostId: data.post._id,
          error: igPlatform?.error
        }
      }
    })

    console.log(`❌ [Late Webhook] Post ${post.id} partially published (Instagram FAILED)`)
  }
}

/**
 * Account disconnected (CRITICAL ALERT)
 */
async function handleAccountDisconnected(data: {
  account: {
    _id: string
    platform: string
    username: string
  }
}) {
  console.error('🚨 [Late Webhook] ACCOUNT DISCONNECTED:', data.account.username)

  // Find all projects using this account
  const projects = await db.project.findMany({
    where: {
      laterAccountId: data.account._id
    },
    select: {
      id: true,
      name: true,
      userId: true
    }
  })

  if (projects.length === 0) {
    console.warn('[Late Webhook] No projects found with this account')
    return
  }

  console.error(`🚨 ${projects.length} project(s) affected by account disconnection`)

  // TODO: Send urgent notification to project owners
  // - Email alert
  // - In-app notification
  // - SMS (critical)

  for (const project of projects) {
    console.error(`🚨 Project affected: ${project.name} (ID: ${project.id})`)

    // Could create a notification record here
    // await createNotification({
    //   userId: project.userId,
    //   type: 'CRITICAL',
    //   title: 'Conta Instagram Desconectada',
    //   message: `A conta @${data.account.username} foi desconectada do Late. Postagens agendadas não serão publicadas!`,
    //   projectId: project.id
    // })
  }
}

/**
 * Analytics updated
 */
async function handleAnalyticsUpdated(data: {
  postId: string
  metrics: {
    likes: number
    comments: number
    shares?: number
    reach?: number
    impressions?: number
    engagement: number
  }
}) {
  console.log('[Late Webhook] Processing analytics_updated:', data.postId)

  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.postId }
  })

  if (!post) {
    console.warn(`[Late Webhook] Post not found: ${data.postId}`)
    return
  }

  await db.socialPost.update({
    where: { id: post.id },
    data: {
      analyticsLikes: data.metrics.likes,
      analyticsComments: data.metrics.comments,
      analyticsShares: data.metrics.shares || 0,
      analyticsReach: data.metrics.reach,
      analyticsImpressions: data.metrics.impressions,
      analyticsEngagement: data.metrics.engagement,
      analyticsFetchedAt: new Date()
    }
  })

  console.log(`📊 [Late Webhook] Analytics updated for post ${post.id}`)
}
