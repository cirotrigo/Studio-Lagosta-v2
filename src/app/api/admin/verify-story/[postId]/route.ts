import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'
import { PostType, PostStatus, VerificationStatus } from '../../../../../../prisma/generated/client'
import { InstagramGraphApiClient, InstagramApiException } from '@/lib/instagram/graph-api-client'

const FALLBACK_WINDOW_MINUTES = 5
const STORY_TTL_HOURS = 24

const isVideoUrl = (url: string) => {
  const lower = url.toLowerCase()
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.avi') || lower.includes('video') || lower.includes('.webm')
}

const detectMediaType = (urls: string[]): 'image' | 'video' | null => {
  if (urls.length === 0) return null
  return urls.some(isVideoUrl) ? 'video' : 'image'
}

/**
 * POST /api/admin/verify-story/[postId]
 *
 * Forces manual verification of a story post, ignoring max attempts.
 * Only respects TTL (24h) limit.
 *
 * Authorization: Admin only
 * Rate Limit: None (admin endpoint)
 */
export async function POST(request: Request, ctx: { params: Promise<{ postId: string }> }) {
  const startTime = Date.now()

  try {
    // 1. Authenticate and verify admin
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Get postId from params
    const { postId } = await ctx.params

    // 3. Fetch post with project data
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      include: {
        Project: {
          select: {
            id: true,
            instagramAccountId: true,
            instagramUsername: true,
            instagramUserId: true,
          },
        },
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // 4. Validate post type
    if (post.postType !== PostType.STORY) {
      return NextResponse.json(
        { error: 'Invalid post type', detail: 'Only STORY posts can be verified' },
        { status: 400 }
      )
    }

    // 5. Validate post status
    if (post.status !== PostStatus.POSTED) {
      return NextResponse.json(
        { error: 'Invalid post status', detail: 'Post must have status POSTED' },
        { status: 400 }
      )
    }

    // 6. Check if verification is already complete
    if (post.verificationStatus === VerificationStatus.VERIFIED) {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        result: {
          verificationStatus: post.verificationStatus,
          verifiedStoryId: post.verifiedStoryId,
          verifiedPermalink: post.verifiedPermalink,
          verifiedTimestamp: post.verifiedTimestamp,
          verifiedByFallback: post.verifiedByFallback,
          verificationAttempts: post.verificationAttempts,
        },
      })
    }

    // 7. Get base timestamp
    const baseTimestamp = post.sentAt || post.bufferSentAt || post.scheduledDatetime || post.createdAt

    // 8. Check TTL (24h expiration)
    const ttlMs = STORY_TTL_HOURS * 60 * 60 * 1000
    const isExpired = Date.now() - baseTimestamp.getTime() > ttlMs

    if (isExpired) {
      return NextResponse.json(
        {
          error: 'TTL expired',
          detail: 'Story has expired (>24h). Instagram stories are only available for 24 hours.',
        },
        { status: 400 }
      )
    }

    // 9. Validate Instagram account
    const igUserId = post.Project.instagramUserId || post.Project.instagramAccountId
    if (!igUserId) {
      return NextResponse.json(
        { error: 'No Instagram account', detail: 'Project has no Instagram account configured' },
        { status: 400 }
      )
    }

    // 10. Fetch stories from Instagram API
    const client = new InstagramGraphApiClient()
    let stories

    try {
      stories = await client.getStories(igUserId)
    } catch (error) {
      if (error instanceof InstagramApiException) {
        return NextResponse.json(
          {
            error: 'Instagram API error',
            detail: error.message,
            code: error.code,
            type: error.type,
          },
          { status: 502 }
        )
      }

      throw error
    }

    // 11. Try to match by TAG (Plano A)
    const tag = post.verificationTag
    let matchedStory = null
    let verifiedByFallback = false

    if (tag) {
      matchedStory = stories.find((story) => story.caption?.includes(tag))

      if (matchedStory) {
        console.log('[Admin Verification] Story found by TAG', {
          postId: post.id,
          adminId: userId,
          storyId: matchedStory.id,
        })
      }
    }

    // 12. Try fallback by timestamp + media_type (Plano B)
    if (!matchedStory) {
      const expectedMediaType = detectMediaType(post.mediaUrls)
      const candidates = stories.filter((story) => {
        if (!story.timestamp) return false
        const storyTimestamp = new Date(story.timestamp)
        const diffMinutes = Math.abs(storyTimestamp.getTime() - baseTimestamp.getTime()) / (60 * 1000)
        if (diffMinutes > FALLBACK_WINDOW_MINUTES) return false

        if (!expectedMediaType || !story.media_type) return true
        return story.media_type.toLowerCase() === expectedMediaType
      })

      if (candidates.length === 1) {
        matchedStory = candidates[0]
        verifiedByFallback = true

        console.log('[Admin Verification] Story found by fallback', {
          postId: post.id,
          adminId: userId,
          storyId: matchedStory.id,
          expectedMediaType,
        })
      } else if (candidates.length > 1) {
        return NextResponse.json(
          {
            error: 'Ambiguous match',
            detail: `Found ${candidates.length} stories matching timestamp + media_type. Cannot determine which one is correct.`,
            candidates: candidates.map((s) => ({
              id: s.id,
              timestamp: s.timestamp,
              media_type: s.media_type,
              permalink: s.permalink,
            })),
          },
          { status: 409 }
        )
      }
    }

    // 13. Handle not found
    if (!matchedStory) {
      return NextResponse.json(
        {
          error: 'Story not found',
          detail: 'Could not find matching story by TAG or fallback method',
          searchCriteria: {
            tag: post.verificationTag,
            baseTimestamp,
            expectedMediaType: detectMediaType(post.mediaUrls),
            windowMinutes: FALLBACK_WINDOW_MINUTES,
          },
        },
        { status: 404 }
      )
    }

    // 14. Update post as verified
    const now = new Date()
    const updatedPost = await db.socialPost.update({
      where: { id: post.id },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        verificationAttempts: post.verificationAttempts + 1,
        verifiedByFallback,
        verifiedStoryId: matchedStory.id,
        verifiedPermalink: matchedStory.permalink,
        verifiedTimestamp: matchedStory.timestamp ? new Date(matchedStory.timestamp) : null,
        lastVerificationAt: now,
        nextVerificationAt: null,
        verificationError: null,
      },
    })

    // 15. Log audit trail
    console.log('[Admin Verification] Post verified successfully', {
      postId: post.id,
      projectId: post.projectId,
      adminId: userId,
      verifiedByFallback,
      storyId: matchedStory.id,
      durationMs: Date.now() - startTime,
    })

    // 16. Return success response
    return NextResponse.json({
      success: true,
      alreadyVerified: false,
      result: {
        verificationStatus: updatedPost.verificationStatus,
        verifiedStoryId: updatedPost.verifiedStoryId,
        verifiedPermalink: updatedPost.verifiedPermalink,
        verifiedTimestamp: updatedPost.verifiedTimestamp,
        verifiedByFallback: updatedPost.verifiedByFallback,
        verificationAttempts: updatedPost.verificationAttempts,
        lastVerificationAt: updatedPost.lastVerificationAt,
      },
      audit: {
        adminId: userId,
        timestamp: now,
        durationMs: Date.now() - startTime,
      },
    })
  } catch (error) {
    console.error('[Admin Verification] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
