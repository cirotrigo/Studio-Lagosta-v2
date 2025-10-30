import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Buffer Post Confirmation Webhook
 *
 * This webhook receives confirmation from Zapier when a post has been
 * successfully sent to Instagram via Buffer.
 *
 * Payload from Zapier:
 * - studio_post_id: ID of the post in Studio Lagosta
 * - buffer_id: ID of the Buffer update
 * - status: "sent" or "failed"
 * - service_update_id: Instagram media_id (if status = "sent")
 * - sent_at: Unix timestamp of publication
 * - post_type: "post", "reels", or "story"
 * - error_message: Error details (if status = "failed")
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Validate webhook secret
    const secret = req.headers.get('x-webhook-secret')
    if (secret !== process.env.BUFFER_WEBHOOK_SECRET) {
      console.error('❌ Buffer webhook: Invalid secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse payload
    const payload = await req.json()
    const {
      studio_post_id,
      buffer_id,
      status,
      service_update_id,
      sent_at,
      post_type,
      error_message,
    } = payload

    console.log('📩 Buffer webhook received:', {
      studio_post_id,
      buffer_id,
      status,
      post_type,
    })

    // 3. Validate required fields
    if (!studio_post_id) {
      console.error('❌ Buffer webhook: Missing studio_post_id')
      return NextResponse.json({ error: 'Missing studio_post_id' }, { status: 400 })
    }

    // 4. Find post in database
    const post = await db.socialPost.findUnique({
      where: { id: studio_post_id },
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
      console.error(`❌ Buffer webhook: Post ${studio_post_id} not found`)
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // 5. Handle failed posts
    if (status === 'failed') {
      await db.socialPost.update({
        where: { id: studio_post_id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage: error_message || 'Failed to publish via Buffer',
          bufferId: buffer_id,
        },
      })

      console.log(`❌ Post ${studio_post_id} marked as FAILED`)
      return NextResponse.json({
        success: true,
        message: 'Post marked as failed',
      })
    }

    // 6. Handle successful posts
    // For successful posts, we need to fetch the Instagram permalink
    let publishedUrl: string | null = null

    // Only fetch permalink for non-Stories (Stories don't have public permalinks)
    if (service_update_id && post_type !== 'story') {
      try {
        publishedUrl = await getInstagramPermalink(service_update_id)
        console.log(`✅ Permalink fetched: ${publishedUrl}`)
      } catch (error) {
        console.error('⚠️ Error fetching Instagram permalink:', error)
        // Don't fail the post if we can't get the permalink
        // The post was published successfully, we just don't have the URL
      }
    }

    // 7. Update post in database
    await db.socialPost.update({
      where: { id: studio_post_id },
      data: {
        status: 'SENT',
        sentAt: sent_at ? new Date(sent_at * 1000) : new Date(),
        publishedUrl,
        instagramMediaId: service_update_id,
        bufferId: buffer_id,
        bufferSentAt: sent_at ? new Date(sent_at * 1000) : new Date(),
      },
    })

    console.log(`✅ Post ${studio_post_id} confirmed as SENT`)
    if (publishedUrl) {
      console.log(`📍 Instagram URL: ${publishedUrl}`)
    }

    // 8. Return success response
    return NextResponse.json({
      success: true,
      postUrl: publishedUrl,
      message:
        post_type === 'story'
          ? 'Story published successfully! (Stories do not have permanent URLs)'
          : publishedUrl
            ? 'Post published successfully!'
            : 'Post published successfully! (URL not available)',
    })
  } catch (error) {
    console.error('❌ Buffer webhook error:', error)
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
 * Fetch Instagram permalink from Instagram Graph API
 *
 * @param mediaId - Instagram media_id (service_update_id from Buffer)
 * @returns Instagram permalink URL or null if not available
 */
async function getInstagramPermalink(mediaId: string): Promise<string | null> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN

  if (!accessToken) {
    console.warn('⚠️ INSTAGRAM_ACCESS_TOKEN not configured, cannot fetch permalink')
    return null
  }

  const url = `https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${accessToken}`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      const error = await response.json()
      console.error('Instagram Graph API error:', error)
      return null
    }

    const data = await response.json()
    return data.permalink || null
  } catch (error) {
    console.error('Error calling Instagram Graph API:', error)
    return null
  }
}
