import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { getLaterClient } from '@/lib/later'
import type { UpdateLaterPostPayload } from '@/lib/later/types'
import { PostStatus, PostType } from '../../../../../../prisma/generated/client'

export const maxDuration = 60

const POST_SUMMARY_SELECT = {
  id: true,
  projectId: true,
  postType: true,
  status: true,
  caption: true,
  mediaUrls: true,
  scheduledDatetime: true,
  scheduleType: true,
  laterPostId: true,
  lateStatus: true,
  latePlatformUrl: true,
  verificationStatus: true,
  errorMessage: true,
  publishedUrl: true,
  createdAt: true,
  updatedAt: true,
} as const

const areStringArraysEqual = (left?: string[] | null, right?: string[] | null) => {
  const leftValue = left ?? []
  const rightValue = right ?? []
  if (leftValue.length !== rightValue.length) return false
  return leftValue.every((value, index) => value === rightValue[index])
}

const buildLaterMediaItems = (mediaUrls: string[]): Array<{ type: 'image' | 'video'; url: string }> =>
  mediaUrls.map((url) => ({
    type: /\.(mp4|mov|avi|webm)(\?.*)?$/i.test(url) ? ('video' as const) : ('image' as const),
    url,
  }))

// GET /api/external/posts/:postId — post status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId } = await params
  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: POST_SUMMARY_SELECT,
  })

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  return NextResponse.json(post)
}

const updatePostSchema = z
  .object({
    caption: z.string().max(2200).optional(),
    scheduledDatetime: z.string().datetime().optional(),
    mediaUrls: z.array(z.string().url()).min(1).optional(),
  })
  .refine(
    (data) =>
      data.caption !== undefined ||
      data.scheduledDatetime !== undefined ||
      data.mediaUrls !== undefined,
    { message: 'At least one of caption, scheduledDatetime or mediaUrls is required' }
  )

// PATCH /api/external/posts/:postId — reschedule / edit (synced to Zernio)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { postId } = await params
    const data = updatePostSchema.parse(await req.json())

    const existingPost = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        status: true,
        postType: true,
        caption: true,
        scheduledDatetime: true,
        mediaUrls: true,
        laterPostId: true,
        Project: { select: { laterAccountId: true } },
      },
    })

    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (
      existingPost.status === PostStatus.POSTED ||
      existingPost.status === PostStatus.POSTING
    ) {
      return NextResponse.json(
        { error: `Post cannot be modified (status: ${existingPost.status})` },
        { status: 409 }
      )
    }

    const isRescheduling = data.scheduledDatetime !== undefined

    await db.socialPost.update({
      where: { id: postId },
      data: {
        ...(data.caption !== undefined && { caption: data.caption }),
        ...(data.mediaUrls !== undefined && { mediaUrls: data.mediaUrls }),
        ...(isRescheduling && {
          scheduledDatetime: new Date(data.scheduledDatetime!),
          status: PostStatus.SCHEDULED,
          errorMessage: null,
          failedAt: null,
          processingStartedAt: null,
        }),
      },
    })

    // Sync with Zernio if the post was already sent there
    let zernioSynced = false
    if (existingPost.laterPostId) {
      try {
        const laterPayload: UpdateLaterPostPayload = {}

        if (data.caption !== undefined && data.caption !== existingPost.caption) {
          laterPayload.content = data.caption
        }

        if (isRescheduling) {
          const newTime = new Date(data.scheduledDatetime!)
          const oldTime = existingPost.scheduledDatetime
            ? new Date(existingPost.scheduledDatetime)
            : null
          if (newTime.getTime() !== oldTime?.getTime()) {
            laterPayload.scheduledFor = newTime.toISOString()
          }
        }

        const mediaUrlsChanged =
          Array.isArray(data.mediaUrls) &&
          !areStringArraysEqual(data.mediaUrls, existingPost.mediaUrls)
        if (mediaUrlsChanged) {
          laterPayload.mediaItems = buildLaterMediaItems(data.mediaUrls!)

          const laterAccountId = existingPost.Project?.laterAccountId
          if (laterAccountId) {
            const platform: UpdateLaterPostPayload['platforms'][number] = {
              platform: 'instagram',
              accountId: laterAccountId,
            }
            if (existingPost.postType === PostType.STORY) {
              platform.platformSpecificData = { contentType: 'story' }
            }
            laterPayload.platforms = [platform]
          }
        }

        if (Object.keys(laterPayload).length > 0) {
          await getLaterClient().updatePost(existingPost.laterPostId, laterPayload)
          zernioSynced = true
        }
      } catch (error) {
        // Local update succeeded; Zernio sync failure is reported but not fatal
        // (the status-sync cron reconciles, and the caller can retry).
        console.error('[External API] Failed to sync update with Zernio:', error)
      }
    }

    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: POST_SUMMARY_SELECT,
    })

    return NextResponse.json({ success: true, zernioSynced, post })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('[External API] Error updating post:', error)
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
  }
}

// DELETE /api/external/posts/:postId — cancel (removes from Zernio too)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { postId } = await params

    const existingPost = await db.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, status: true, laterPostId: true },
    })

    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Published posts are history, not agenda — refuse unless explicitly forced
    const force = req.nextUrl.searchParams.get('force') === 'true'
    if (existingPost.status === PostStatus.POSTED && !force) {
      return NextResponse.json(
        { error: 'Post already published; pass ?force=true to delete the record anyway' },
        { status: 409 }
      )
    }

    if (existingPost.laterPostId) {
      try {
        await getLaterClient().deletePost(existingPost.laterPostId)
      } catch (error) {
        // Log but don't block local delete (post may already be gone on Zernio)
        console.error(
          `[External API] Failed to delete from Zernio (${existingPost.laterPostId}):`,
          error
        )
      }
    }

    await db.socialPost.delete({ where: { id: postId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[External API] Error deleting post:', error)
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
