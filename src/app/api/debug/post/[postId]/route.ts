import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'

/**
 * Debug endpoint to check post details including laterPostId
 * GET /api/debug/post/:postId
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { postId } = await params

    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        laterPostId: true,
        postType: true,
        caption: true,
        status: true,
        scheduledDatetime: true,
        createdAt: true,
        updatedAt: true,
        Project: {
          select: {
            id: true,
            name: true,
            postingProvider: true,
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

    return NextResponse.json({
      success: true,
      post: {
        ...post,
        debug: {
          hasLaterPostId: !!post.laterPostId,
          laterPostIdType: typeof post.laterPostId,
          laterPostIdLength: post.laterPostId?.length || 0,
        },
      },
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
