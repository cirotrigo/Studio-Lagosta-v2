import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { PostType, ScheduleType, PostStatus, PublishType, Prisma } from '../../../../../../../prisma/generated/client'
import { PostScheduler } from '@/lib/posts/scheduler'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

// GET: Fetch individual post
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; postId: string }> }
) {
  try {
    const { projectId: projectIdParam, postId } = await params
    const projectId = parseInt(projectIdParam, 10)

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: { clerkOrgId: true, name: true },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (
      !hasProjectReadAccess(project, {
        userId: clerkUserId,
        orgId,
      })
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch post
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      include: {
        Generation: true,
      },
    })

    if (!post || post.projectId !== projectId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json(post)
  } catch (error) {
    console.error('Error fetching post:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: Update post
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; postId: string }> }
) {
  try {
    const { projectId: projectIdParam, postId } = await params
    const projectId = parseInt(projectIdParam, 10)

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const { userId: clerkUserId, orgId, sessionClaims } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: { clerkOrgId: true, name: true },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (
      !hasProjectWriteAccess(project, {
        userId: clerkUserId,
        orgId,
      })
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify post belongs to project
    const existingPost = await db.socialPost.findUnique({
      where: { id: postId },
    })

    if (!existingPost || existingPost.projectId !== projectId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      postType,
      caption,
      scheduleType,
      scheduledDatetime,
      recurringConfig,
      altText,
      firstComment,
      publishType,
    } = body

    // Prepare update data
    const updateData: Prisma.SocialPostUpdateInput = {
      ...(postType && { postType: postType as PostType }),
      ...(caption !== undefined && { caption }),
      ...(scheduleType && { scheduleType: scheduleType as ScheduleType }),
      ...(scheduleType === 'IMMEDIATE'
        ? { scheduledDatetime: new Date() }
        : scheduledDatetime !== undefined
          ? {
              scheduledDatetime: scheduledDatetime ? new Date(scheduledDatetime) : null,
            }
          : {}),
      ...(recurringConfig !== undefined && {
        recurringConfig: recurringConfig ? JSON.parse(JSON.stringify(recurringConfig)) : null,
      }),
      ...(altText !== undefined && { altText }),
      ...(firstComment !== undefined && { firstComment }),
      ...(publishType !== undefined && { publishType: publishType as PublishType }),
    }

    // If changing to IMMEDIATE, set status to POSTING and clear error fields
    if (scheduleType === 'IMMEDIATE') {
      updateData.status = PostStatus.POSTING
      updateData.errorMessage = null
      updateData.failedAt = null
    }

    // Update post
    const updatedPost = await db.socialPost.update({
      where: { id: postId },
      data: updateData,
      include: {
        Generation: true,
      },
    })

    // If schedule type changed to IMMEDIATE, send to Zapier now
    if (scheduleType === 'IMMEDIATE') {
      const scheduler = new PostScheduler()
      // Send asynchronously (don't wait)
      scheduler.sendToZapier(postId).catch((error) => {
        console.error('Error sending immediate post to Zapier:', error)
      })
    }

    return NextResponse.json(updatedPost)
  } catch (error) {
    console.error('Error updating post:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete post
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; postId: string }> }
) {
  try {
    const { projectId: projectIdParam, postId } = await params
    const projectId = parseInt(projectIdParam, 10)

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    const { userId: clerkUserId, orgId, sessionClaims } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: { clerkOrgId: true, name: true },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (
      !hasProjectWriteAccess(project, {
        userId: clerkUserId,
        orgId,
      })
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify post belongs to project
    const existingPost = await db.socialPost.findUnique({
      where: { id: postId },
    })

    if (!existingPost || existingPost.projectId !== projectId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Delete post
    await db.socialPost.delete({
      where: { id: postId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting post:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
