import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * TEST ENDPOINT - Simula webhook do Buffer
 * GET /api/webhooks/buffer/test?postId=xxx&success=true
 *
 * Use este endpoint para testar o webhook sem precisar do Zapier
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.searchParams
    const postId = searchParams.get('postId')
    const success = searchParams.get('success') !== 'false' // Default true

    if (!postId) {
      return NextResponse.json(
        { error: 'Missing postId parameter' },
        { status: 400 }
      )
    }

    // Find post
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        status: true,
        postType: true,
        Project: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      )
    }

    // Simulate webhook call
    const webhookUrl = `${req.nextUrl.origin}/api/webhooks/buffer/post-sent`
    const payload = {
      success,
      buffer_update_id: `test_${Date.now()}`,
      sent_at: Math.floor(Date.now() / 1000),
      message: success ? undefined : 'Test error message',
      metadata: {
        studio_post_id: postId,
        post_id: postId,
      },
    }

    console.log('🧪 TEST: Simulating webhook call...')
    console.log('   Post:', postId)
    console.log('   Success:', success)
    console.log('   Payload:', JSON.stringify(payload, null, 2))

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.BUFFER_WEBHOOK_SECRET || '',
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    return NextResponse.json({
      message: 'Test webhook sent',
      webhookStatus: response.status,
      webhookResponse: result,
      payload,
    })
  } catch (error) {
    console.error('Test webhook error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
