import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { PostType, ScheduleType, PostStatus, PublishType, Prisma, PostingProvider } from '../../../../../../../prisma/generated/client'
import { PostScheduler } from '@/lib/posts/scheduler'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { getLaterClient } from '@/lib/later'
import type { UpdateLaterPostPayload } from '@/lib/later/types'

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
      !hasProjectWriteAccess(project, {
        userId: clerkUserId,
        orgId,
      })
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify post belongs to project and get laterPostId for sync
    const existingPost = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        projectId: true,
        laterPostId: true,
        caption: true,
        scheduledDatetime: true,
      },
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
      mediaUrls,
      generationIds,
      blobPathnames,
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
      ...(mediaUrls !== undefined && { mediaUrls }),
      ...(generationIds !== undefined && {
        generationId: generationIds && generationIds.length > 0 ? generationIds[0] : null
      }),
      ...(blobPathnames !== undefined && { blobPathnames }),
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
        Project: {
          select: {
            postingProvider: true,
          },
        },
      },
    })

    // Sync with Later if this post was created via Later
    if (existingPost.laterPostId) {
      console.log(`[PUT /posts/${postId}] Syncing update with Later post ${existingPost.laterPostId}`)

      try {
        const laterClient = getLaterClient()
        const laterPayload: UpdateLaterPostPayload = {}

        // Update caption if changed
        if (caption !== undefined && caption !== existingPost.caption) {
          laterPayload.text = caption
        }

        // Update scheduled time if changed
        if (scheduledDatetime !== undefined) {
          const newScheduledTime = scheduledDatetime ? new Date(scheduledDatetime) : null
          const oldScheduledTime = existingPost.scheduledDatetime

          // Check if time actually changed
          if (newScheduledTime?.getTime() !== oldScheduledTime?.getTime()) {
            laterPayload.publishAt = newScheduledTime?.toISOString()
          }
        }

        // If there are changes to sync, send to Later
        if (Object.keys(laterPayload).length > 0) {
          console.log('[PUT /posts] Later update payload:', laterPayload)
          await laterClient.updatePost(existingPost.laterPostId, laterPayload)
          console.log('[PUT /posts] ✅ Later post updated successfully')
        } else {
          console.log('[PUT /posts] No changes to sync with Later')
        }
      } catch (error) {
        console.error('[PUT /posts] ❌ Failed to sync with Later:', error)
        // Don't fail the whole request - local update succeeded
        // User will see the change in our UI even if Later sync failed
      }
    }

    // If schedule type changed to IMMEDIATE, send via scheduler (supports both Later and Zapier)
    if (scheduleType === 'IMMEDIATE') {
      const scheduler = new PostScheduler()

      // Determine which method to use based on posting provider
      if (updatedPost.Project.postingProvider === PostingProvider.LATER && existingPost.laterPostId) {
        console.log('[PUT /posts] Publishing Later post immediately')
        // For Later posts, we can use publishPost API
        const laterClient = getLaterClient()
        laterClient.publishPost(existingPost.laterPostId).catch((error) => {
          console.error('Error publishing Later post immediately:', error)
        })
      } else {
        // For Zapier posts, use existing flow
        console.log('[PUT /posts] Sending to Zapier immediately')
        scheduler.sendToZapier(postId).catch((error) => {
          console.error('Error sending immediate post to Zapier:', error)
        })
      }
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
