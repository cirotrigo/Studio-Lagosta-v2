import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { PostType, ScheduleType, PostStatus, PublishType, Prisma } from '../../../../../../../prisma/generated/client'
import { PostScheduler } from '@/lib/posts/scheduler'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { getLaterClient } from '@/lib/later'
import type { UpdateLaterPostPayload } from '@/lib/later/types'

const areStringArraysEqual = (left?: string[] | null, right?: string[] | null) => {
  const leftValue = left ?? []
  const rightValue = right ?? []
  if (leftValue.length !== rightValue.length) return false
  return leftValue.every((value, index) => value === rightValue[index])
}

const mapPostTypeToLater = (postType: PostType) => {
  switch (postType) {
    case PostType.STORY:
      return 'story'
    case PostType.REEL:
      return 'reel'
    case PostType.CAROUSEL:
      return 'carousel'
    default:
      return 'post'
  }
}

const buildLaterMediaItems = (mediaUrls: string[]): Array<{ type: 'image' | 'video'; url: string }> =>
  mediaUrls.map((url) => ({
    type: /\.(mp4|mov|avi|webm)(\?.*)?$/i.test(url) ? ('video' as const) : ('image' as const),
    url,
  }))

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
  console.error('🚨🚨🚨 PUT HANDLER STARTED 🚨🚨🚨')
  try {
    const { projectId: projectIdParam, postId } = await params
    console.error(`🔵 PUT /api/projects/${projectIdParam}/posts/${postId}`)
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
        postType: true,
        mediaUrls: true,
      },
    })

    if (!existingPost || existingPost.projectId !== projectId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const body = await req.json()
    console.error(`[PUT /posts/${postId}] Request received with body:`, JSON.stringify(body, null, 2))

    const {
      postType,
      caption,
      scheduleType,
      scheduledDatetime,
      recurringConfig,
      altText,
      firstComment,
      publishType,
      reminderExtraInfo,
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
      ...(reminderExtraInfo !== undefined && { reminderExtraInfo }),
      ...(publishType !== undefined && { publishType: publishType as PublishType }),
      ...(mediaUrls !== undefined && { mediaUrls }),
      ...(generationIds !== undefined && {
        generationId: generationIds && generationIds.length > 0 ? generationIds[0] : null
      }),
      ...(blobPathnames !== undefined && { blobPathnames }),
    }

    // If changing to IMMEDIATE, clear error fields (status will be set by sender)
    if (scheduleType === 'IMMEDIATE') {
      updateData.errorMessage = null
      updateData.failedAt = null
      updateData.processingStartedAt = null

      // If post already exists in Later, mark as POSTING before publish
      if (existingPost.laterPostId) {
        updateData.status = PostStatus.POSTING
      }
    }

    // If rescheduling, reset status to SCHEDULED and clear failure fields
    if (
      scheduleType === 'SCHEDULED' ||
      (scheduleType === undefined && scheduledDatetime !== undefined)
    ) {
      updateData.status = PostStatus.SCHEDULED
      updateData.errorMessage = null
      updateData.failedAt = null
      updateData.processingStartedAt = null
    }

    // Update post
    const updatedPost = await db.socialPost.update({
      where: { id: postId },
      data: updateData,
      include: {
        Generation: true,
        Project: {
          select: {
            laterAccountId: true,
          },
        },
      },
    })

    // Debug: Check if post has laterPostId
    console.error(`[PUT /posts] 🔍 Checking laterPostId:`, {
      postId: existingPost.id,
      laterPostId: existingPost.laterPostId,
      hasLaterPostId: !!existingPost.laterPostId,
    })

    // Sync with Later if this post was created via Later
    if (existingPost.laterPostId) {
      console.error(`[PUT /posts/${postId}] Syncing update with Later post ${existingPost.laterPostId}`)
      console.error(`[PUT /posts] Received fields:`, {
        caption: caption !== undefined ? 'YES' : 'NO',
        scheduledDatetime: scheduledDatetime !== undefined ? scheduledDatetime : 'NO',
        scheduleType: scheduleType !== undefined ? scheduleType : 'NO',
        mediaUrls: mediaUrls !== undefined ? 'YES' : 'NO',
        postType: postType !== undefined ? 'YES' : 'NO',
      })
      console.error(`[PUT /posts] Existing values:`, {
        caption: existingPost.caption?.substring(0, 50) + '...',
        scheduledDatetime: existingPost.scheduledDatetime?.toISOString(),
      })

      try {
        const laterClient = getLaterClient()
        const laterPayload: UpdateLaterPostPayload = {}

        // Update caption if changed
        if (caption !== undefined && caption !== existingPost.caption) {
          console.error('[PUT /posts] 📝 Caption changed, will update Later')
          laterPayload.content = caption // ✅ Use 'content' not 'text'
        }

        // Update scheduled time if changed
        if (scheduledDatetime !== undefined) {
          const newScheduledTime = scheduledDatetime ? new Date(scheduledDatetime) : null
          // Ensure oldScheduledTime is properly parsed as Date if it's a string
          const oldScheduledTime = existingPost.scheduledDatetime
            ? new Date(existingPost.scheduledDatetime)
            : null

          console.error('[PUT /posts] 📅 Comparing times:', {
            new: newScheduledTime?.toISOString(),
            old: oldScheduledTime?.toISOString(),
            newTimestamp: newScheduledTime?.getTime(),
            oldTimestamp: oldScheduledTime?.getTime(),
            changed: newScheduledTime?.getTime() !== oldScheduledTime?.getTime(),
          })

          // Check if time actually changed (comparing timestamps to avoid timezone issues)
          if (newScheduledTime?.getTime() !== oldScheduledTime?.getTime()) {
            console.error('[PUT /posts] ⏰ Time changed, will update Later')
            laterPayload.scheduledFor = newScheduledTime?.toISOString() // ✅ Use 'scheduledFor' not 'publishAt'
          } else {
            console.error('[PUT /posts] ⏰ Time unchanged, skipping')
          }
        }

        const mediaUrlsChanged =
          Array.isArray(mediaUrls) && !areStringArraysEqual(mediaUrls, existingPost.mediaUrls)
        if (mediaUrlsChanged) {
          console.error('[PUT /posts] 🖼️ Media changed, will update Later')
          laterPayload.mediaItems = buildLaterMediaItems(mediaUrls)
        }

        const postTypeChanged = postType !== undefined && postType !== existingPost.postType
        if (mediaUrlsChanged || postTypeChanged) {
          const targetPostType = (postType ?? existingPost.postType) as PostType
          const laterAccountId = updatedPost.Project?.laterAccountId
          if (laterAccountId) {
            laterPayload.platforms = [
              {
                platform: 'instagram',
                accountId: laterAccountId,
                platformSpecificData: {
                  contentType: mapPostTypeToLater(targetPostType),
                },
              },
            ]
          }
        }

        // If there are changes to sync, send to Later
        if (Object.keys(laterPayload).length > 0) {
          console.error('[PUT /posts] 🚀 Sending update to Later:', laterPayload)

          try {
            await laterClient.updatePost(existingPost.laterPostId, laterPayload)
            console.error('[PUT /posts] ✅ Later post updated successfully via PUT /posts/:id')
          } catch (updateError: any) {
            // Log error but don't fail the whole request - local update succeeded
            console.error('[PUT /posts] ❌ Failed to sync with Later API:', updateError)
            // User will see the change in our UI even if Later sync failed
            // They may need to manually update in Later dashboard
          }
        } else {
          console.error('[PUT /posts] ⚠️ No changes detected to sync with Later')
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

      if (existingPost.laterPostId) {
        console.log('[PUT /posts] Publishing Later post immediately')
        const laterClient = getLaterClient()
        laterClient.publishPost(existingPost.laterPostId).catch((error) => {
          console.error('Error publishing Later post immediately:', error)
        })
      } else {
        console.log('[PUT /posts] Sending post immediately via Late API')
        scheduler.sendToLater(postId).catch((error) => {
          console.error('Error sending immediate post via Late API:', error)
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
