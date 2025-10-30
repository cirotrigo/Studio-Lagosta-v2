import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Get Post Status
 *
 * Returns the current status of a post, including publication details.
 * Used by frontend for polling to detect when a post has been published.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId } = await params

    // Get post with minimal fields needed for status check
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        status: true,
        publishedUrl: true,
        instagramMediaId: true,
        bufferId: true,
        sentAt: true,
        bufferSentAt: true,
        failedAt: true,
        errorMessage: true,
        postType: true,
        userId: true,
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Verify ownership
    if (post.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Return status
    return NextResponse.json({
      id: post.id,
      status: post.status,
      publishedUrl: post.publishedUrl,
      instagramMediaId: post.instagramMediaId,
      bufferId: post.bufferId,
      sentAt: post.sentAt,
      bufferSentAt: post.bufferSentAt,
      failedAt: post.failedAt,
      errorMessage: post.errorMessage,
      postType: post.postType,
    })
  } catch (error) {
    console.error('Error fetching post status:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
