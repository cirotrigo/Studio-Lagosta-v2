import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostType, ScheduleType, RecurrenceFrequency, PostLogEvent } from '../../../../../../../prisma/generated/client'

const updatePostSchema = z.object({
  postType: z.nativeEnum(PostType).optional(),
  caption: z.string().max(2200).optional(),
  scheduleType: z.nativeEnum(ScheduleType).optional(),
  scheduledDatetime: z.string().datetime().optional().nullable(),
  recurringConfig: z.object({
    frequency: z.nativeEnum(RecurrenceFrequency),
    daysOfWeek: z.array(z.number()).optional(),
    time: z.string(),
    endDate: z.string().datetime().optional(),
  }).optional().nullable(),
  altText: z.array(z.string()).optional(),
  firstComment: z.string().optional().nullable(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; postId: string } }
) {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(params.projectId)
    const postId = params.postId

    const post = await db.socialPost.findFirst({
      where: {
        id: postId,
        projectId,
        userId: user.id,
      },
      include: {
        Generation: {
          select: {
            id: true,
            templateName: true,
            resultUrl: true,
          },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json(post)

  } catch (error) {
    console.error('Error fetching post:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { projectId: string; postId: string } }
) {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(params.projectId)
    const postId = params.postId

    // Verify ownership
    const existingPost = await db.socialPost.findFirst({
      where: {
        id: postId,
        projectId,
        userId: user.id,
      },
    })

    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Can't edit posts that are already sent
    if (existingPost.status === 'SENT') {
      return NextResponse.json(
        { error: 'Cannot edit sent posts' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const data = updatePostSchema.parse(body)

    // Update post
    const updatedPost = await db.socialPost.update({
      where: { id: postId },
      data: {
        ...data,
        scheduledDatetime: data.scheduledDatetime ? new Date(data.scheduledDatetime) : undefined,
      },
    })

    // Log the edit
    await db.postLog.create({
      data: {
        postId,
        event: PostLogEvent.EDITED,
        message: 'Post editado',
        metadata: { changes: data },
      },
    })

    return NextResponse.json(updatedPost)

  } catch (error) {
    console.error('Error updating post:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; postId: string } }
) {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(params.projectId)
    const postId = params.postId

    // Verify ownership
    const post = await db.socialPost.findFirst({
      where: {
        id: postId,
        projectId,
        userId: user.id,
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Delete post (cascade will handle related records)
    await db.socialPost.delete({
      where: { id: postId },
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting post:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
