import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  PostStatus,
  PostType,
  VerificationStatus,
  PostLogEvent,
} from '../../../../../prisma/generated/client'
import { INITIAL_VERIFICATION_DELAY_MINUTES } from '@/lib/posts/verification/story-verifier'
import crypto from 'crypto'

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60 * 1000)

export const runtime = 'nodejs'

/**
 * Later Webhook Handler
 *
 * Receives events from Later API when posts are published or fail.
 *
 * Supported Events:
 * - post.scheduled: Confirmation that post was scheduled
 * - post.published: Post was successfully published to Instagram
 * - post.failed: Post failed to publish
 *
 * Webhook Signature Validation: HMAC SHA256
 */
export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log('\n' + '='.repeat(80))
  console.log(`📥 LATER WEBHOOK RECEIVED at ${timestamp}`)
  console.log('='.repeat(80))

  try {
    // 1. Get raw body for signature validation
    const rawBody = await req.text()

    // 2. Validate webhook signature
    const signature = req.headers.get('x-later-signature')
    const webhookSecret = process.env.LATER_WEBHOOK_SECRET

    console.log('🔐 Validating webhook signature...')
    console.log(
      `   Received signature: ${signature ? signature.substring(0, 20) + '...' : 'NONE'}`
    )
    console.log(
      `   Webhook secret configured: ${webhookSecret ? 'YES' : 'NO'}`
    )

    if (!webhookSecret) {
      console.warn('⚠️ LATER_WEBHOOK_SECRET not configured - skipping signature validation')
    } else if (!signature) {
      console.warn('⚠️ No signature provided - allowing (Later test webhook)')
    } else if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error('❌ Later webhook: Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    } else {
      console.log('✅ Signature validated successfully')
    }

    // 3. Parse payload
    const payload = JSON.parse(rawBody)

    // Handle Later test webhook (uses "evento" in Portuguese)
    if (payload.evento === 'webhook.test' || payload.event === 'webhook.test') {
      console.log('✅ Later test webhook received successfully')
      console.log('   Message:', payload.mensagem || payload.message)
      return NextResponse.json({
        success: true,
        message: 'Webhook test received successfully',
      })
    }

    const { event, timestamp: eventTimestamp, data } = payload

    console.log('📩 Later webhook event:', {
      event,
      timestamp: eventTimestamp,
      postId: data?.postId,
      accountId: data?.accountId,
      status: data?.status,
    })

    if (!event || !data) {
      console.error('❌ Later webhook: Missing event or data')
      return NextResponse.json(
        { error: 'Invalid payload - missing event or data' },
        { status: 400 }
      )
    }

    // 4. Process event based on type
    switch (event) {
      case 'post.scheduled':
        await handlePostScheduled(data)
        break

      case 'post.published':
        await handlePostPublished(data)
        break

      case 'post.failed':
        await handlePostFailed(data)
        break

      default:
        console.log(`⚠️ Unhandled Later webhook event: ${event}`)
        return NextResponse.json({
          success: true,
          message: `Event ${event} received but not handled`,
        })
    }

    console.log('='.repeat(80) + '\n')

    return NextResponse.json({
      success: true,
      message: `Event ${event} processed successfully`,
    })
  } catch (error) {
    console.error('\n' + '!'.repeat(80))
    console.error('❌ LATER WEBHOOK ERROR')
    console.error('!'.repeat(80))
    console.error('Error:', error)
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('!'.repeat(80) + '\n')

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Handle post.scheduled event
 * Confirms that post was successfully scheduled in Later
 */
async function handlePostScheduled(data: any) {
  console.log('📅 Processing post.scheduled event...')
  console.log(`   Later Post ID: ${data.postId}`)

  // Find post by laterPostId
  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.postId },
    select: {
      id: true,
      status: true,
      postType: true,
      Project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!post) {
    console.warn(`⚠️ Post not found for Later post ID: ${data.postId}`)
    return
  }

  console.log(`📍 Found post: ${post.id} from project ${post.Project.name}`)

  // Update status to SCHEDULED if not already
  if (post.status !== PostStatus.SCHEDULED) {
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        status: PostStatus.SCHEDULED,
      },
    })

    console.log(`✅ Post ${post.id} confirmed as SCHEDULED`)
  } else {
    console.log(`ℹ️ Post ${post.id} already SCHEDULED`)
  }

  // Create log
  await db.postLog.create({
    data: {
      postId: post.id,
      event: PostLogEvent.SCHEDULED,
      message: 'Post agendado confirmado via Later webhook',
      metadata: data,
    },
  })
}

/**
 * Handle post.published event
 * Updates post status to POSTED and schedules story verification if needed
 */
async function handlePostPublished(data: any) {
  console.log('✨ Processing post.published event...')
  console.log(`   Later Post ID: ${data.postId}`)
  console.log(`   Platform Post ID: ${data.platformPostId || 'Not provided'}`)
  console.log(`   Permalink: ${data.permalink || 'Not provided'}`)

  // Find post by laterPostId
  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.postId },
    select: {
      id: true,
      status: true,
      postType: true,
      publishType: true,
      Project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!post) {
    console.warn(`⚠️ Post not found for Later post ID: ${data.postId}`)
    return
  }

  console.log(`📍 Found post: ${post.id} from project ${post.Project.name}`)

  // Parse published timestamp
  const publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date()

  // Prepare verification data for stories
  const verificationData =
    post.postType === PostType.STORY && post.publishType === 'DIRECT'
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
      : post.postType === PostType.STORY && post.publishType === 'REMINDER'
      ? {
          verificationStatus: VerificationStatus.SKIPPED,
        }
      : {}

  // Update post status to POSTED
  await db.socialPost.update({
    where: { id: post.id },
    data: {
      status: PostStatus.POSTED,
      sentAt: publishedAt,
      publishedUrl: data.permalink || null,
      instagramMediaId: data.platformPostId || null,
      ...verificationData,
    },
  })

  console.log(`✅ Post ${post.id} confirmed as POSTED`)
  console.log(`   Project: ${post.Project.name}`)
  console.log(`   Type: ${post.postType}`)
  console.log(`   Published at: ${publishedAt.toISOString()}`)

  if (post.postType === PostType.STORY && post.publishType === 'DIRECT') {
    console.log(
      `🔍 Story verification scheduled for ${INITIAL_VERIFICATION_DELAY_MINUTES} minutes from now`
    )
  }

  // Create log
  await db.postLog.create({
    data: {
      postId: post.id,
      event: PostLogEvent.SENT,
      message: 'Post publicado com sucesso via Later',
      metadata: data,
    },
  })
}

/**
 * Handle post.failed event
 * Updates post status to FAILED and records error message
 */
async function handlePostFailed(data: any) {
  console.log('💥 Processing post.failed event...')
  console.log(`   Later Post ID: ${data.postId}`)
  console.log(`   Errors: ${data.errors?.join(', ') || 'No error message'}`)

  // Find post by laterPostId
  const post = await db.socialPost.findFirst({
    where: { laterPostId: data.postId },
    select: {
      id: true,
      status: true,
      postType: true,
      publishType: true,
      Project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!post) {
    console.warn(`⚠️ Post not found for Later post ID: ${data.postId}`)
    return
  }

  console.log(`📍 Found post: ${post.id} from project ${post.Project.name}`)

  const errorMessage = data.errors?.join(', ') || 'Failed to publish via Later'

  // Update post status to FAILED
  await db.socialPost.update({
    where: { id: post.id },
    data: {
      status: PostStatus.FAILED,
      failedAt: new Date(),
      errorMessage,
    },
  })

  console.log(`❌ Post ${post.id} marked as FAILED`)
  console.log(`   Project: ${post.Project.name}`)
  console.log(`   Error: ${errorMessage}`)

  // Create log
  await db.postLog.create({
    data: {
      postId: post.id,
      event: PostLogEvent.FAILED,
      message: `Falha ao publicar via Later: ${errorMessage}`,
      metadata: data,
    },
  })
}

/**
 * Verify webhook signature using HMAC SHA256
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(payload).digest('hex')

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    )
  } catch (error) {
    console.error('Error verifying webhook signature:', error)
    return false
  }
}
