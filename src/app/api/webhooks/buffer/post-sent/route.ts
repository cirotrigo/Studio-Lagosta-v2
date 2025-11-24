import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PostStatus, PostType, VerificationStatus } from '../../../../../../prisma/generated/client'
import { INITIAL_VERIFICATION_DELAY_MINUTES } from '@/lib/posts/verification/story-verifier'

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000)

export const runtime = 'nodejs'

/**
 * Buffer Post Confirmation Webhook (SIMPLIFIED)
 *
 * Recebe confirmação do Zapier quando um post foi enviado via Buffer.
 *
 * ESTRATÉGIA SIMPLIFICADA:
 * - Identifica o post pelo último post com status POSTING
 * - Atualiza para POSTED (sucesso) ou FAILED (falha)
 * - Usa campo Success do Buffer (true/false)
 *
 * Payload esperado do Zapier (apenas 3 campos!):
 * - success: true ou false (OBRIGATÓRIO) - do campo "Success" do Buffer
 * - buffer_update_id: ID do update no Buffer (opcional, para log)
 * - sent_at: Unix timestamp (opcional, para registro preciso)
 */
export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log('\n' + '='.repeat(80))
  console.log(`📥 BUFFER WEBHOOK RECEIVED at ${timestamp}`)
  console.log('='.repeat(80))

  try {
    // 1. Validate webhook secret
    const secret = req.headers.get('x-webhook-secret')
    const expectedSecret = process.env.BUFFER_WEBHOOK_SECRET

    console.log('🔐 Validating webhook secret...')
    console.log(`   Received secret: ${secret ? secret.substring(0, 10) + '...' : 'NONE'}`)
    console.log(`   Expected secret: ${expectedSecret ? expectedSecret.substring(0, 10) + '...' : 'NOT SET'}`)

    if (secret !== expectedSecret) {
      console.error('❌ Buffer webhook: Invalid secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ Secret validated successfully')

    // 2. Parse payload
    const payload = await req.json()
    const {
      success,
      buffer_update_id,
      sent_at,
      message,
      metadata,
    } = payload

    console.log('📩 Buffer webhook received:', {
      success,
      buffer_update_id,
      sent_at,
      message,
      metadata,
    })

    // 3. Validate required fields
    if (success === undefined || success === null) {
      console.error('❌ Buffer webhook: Missing success field')
      return NextResponse.json({ error: 'Missing success field' }, { status: 400 })
    }

    // 4. Find the post - prioritize metadata.studio_post_id if available
    let post
    const postId = metadata?.studio_post_id || metadata?.post_id

    if (postId) {
      console.log(`🔍 Looking for post by ID from metadata: ${postId}`)
      post = await db.socialPost.findUnique({
        where: { id: postId },
        select: {
          id: true,
          status: true,
          postType: true,
          createdAt: true,
          Project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (post && post.status !== PostStatus.POSTING) {
        console.warn(`⚠️ Post ${postId} found but status is ${post.status}, not POSTING`)
      }
    }

    // Fallback: Find the most recent POSTING post if no ID provided or post not found
    if (!post) {
      console.log('🔍 No post ID in metadata or post not found, using fallback: most recent POSTING post')
      post = await db.socialPost.findFirst({
        where: {
          status: PostStatus.POSTING,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          postType: true,
          createdAt: true,
          Project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    }

    if (!post) {
      console.error('❌ Buffer webhook: No POSTING post found')
      return NextResponse.json(
        {
          error: 'No pending post found',
          hint: 'Post may have already been processed or does not exist',
          received_post_id: postId,
        },
        { status: 404 }
      )
    }

    console.log(`📍 Found post: ${post.id} from project ${post.Project.name} (status: ${post.status})`)

    // 5. Handle failed posts (success = false)
    if (success === false) {
      console.log('💥 Processing FAILED post...')
      console.log(`   Post ID: ${post.id}`)
      console.log(`   Error message: ${message || 'No error message provided'}`)

      const verificationFailureData =
        post.postType === PostType.STORY
          ? {
              verificationStatus: VerificationStatus.VERIFICATION_FAILED,
              nextVerificationAt: null,
              verificationError: 'POST_FAILED',
            }
          : {}

      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.FAILED,
          failedAt: new Date(),
          errorMessage: message || 'Failed to publish via Buffer',
          bufferId: buffer_update_id,
          ...verificationFailureData,
        },
      })

      console.log(`❌ Post ${post.id} marked as FAILED`)
      console.log(`   Project: ${post.Project.name}`)
      console.log(`   Error: ${message}`)
      console.log('='.repeat(80) + '\n')

      return NextResponse.json({
        success: true,
        message: 'Post marked as failed',
        postId: post.id,
      })
    }

    // 6. Handle successful posts (success = true)
    console.log('✨ Processing SUCCESSFUL post...')
    console.log(`   Post ID: ${post.id}`)
    console.log(`   Buffer ID: ${buffer_update_id || 'Not provided'}`)
    console.log(`   Sent at: ${sent_at ? new Date(sent_at * 1000).toISOString() : 'Using current time'}`)

    const sentAtDate = sent_at ? new Date(sent_at * 1000) : new Date()

    const verificationData =
      post.postType === PostType.STORY
        ? {
            verificationStatus: VerificationStatus.PENDING,
            verificationAttempts: 0,
            nextVerificationAt: addMinutes(sentAtDate, INITIAL_VERIFICATION_DELAY_MINUTES),
            lastVerificationAt: null,
            verificationError: null,
            verifiedByFallback: false,
            verifiedStoryId: null,
            verifiedPermalink: null,
            verifiedTimestamp: null,
          }
        : {}

    await db.socialPost.update({
      where: { id: post.id },
      data: {
        status: PostStatus.POSTED,
        sentAt: sentAtDate,
        bufferId: buffer_update_id,
        bufferSentAt: sentAtDate,
        ...verificationData,
      },
    })

    console.log(`✅ Post ${post.id} confirmed as POSTED`)
    console.log(`   Project: ${post.Project.name}`)
    console.log(`   Type: ${post.postType}`)
    console.log('='.repeat(80) + '\n')

    // 7. Return success response
    return NextResponse.json({
      success: true,
      message: 'Post marked as published',
      postId: post.id,
      projectName: post.Project.name,
    })
  } catch (error) {
    console.error('\n' + '!'.repeat(80))
    console.error('❌ BUFFER WEBHOOK ERROR')
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
