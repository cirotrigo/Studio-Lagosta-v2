/**
 * Manual sync endpoint: import posts from Zernio into local DB for a specific project
 * POST /api/projects/{projectId}/posts/sync-zernio
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getLaterClient } from '@/lib/later'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostStatus, PostType, ScheduleType, PublishType, VerificationStatus, RenderStatus } from '@prisma/client'

function mapZernioStatus(status: string): PostStatus {
  switch (status) {
    case 'draft': return PostStatus.DRAFT
    case 'scheduled': return PostStatus.SCHEDULED
    case 'publishing': return PostStatus.POSTING
    case 'published': return PostStatus.POSTED
    case 'failed': return PostStatus.FAILED
    default: return PostStatus.SCHEDULED
  }
}

function mapZernioPostType(platformData: any): PostType {
  const contentType = platformData?.platformSpecificData?.contentType
  switch (contentType) {
    case 'story': return PostType.STORY
    case 'reel': return PostType.REEL
    case 'carousel': return PostType.CAROUSEL
    default: return PostType.POST
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { projectId } = await params
    const projectIdNum = parseInt(projectId)

    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId: user.id },
      select: { id: true, laterAccountId: true, userId: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.laterAccountId) {
      return NextResponse.json({ error: 'Zernio account not configured for this project' }, { status: 400 })
    }

    const client = getLaterClient()
    const zernioPosts = await client.listPosts({
      accountId: project.laterAccountId,
      limit: 100,
    })

    let imported = 0
    let updated = 0
    let skipped = 0

    for (const zPost of zernioPosts) {
      const existing = await db.socialPost.findFirst({
        where: { laterPostId: zPost.id },
      })

      if (existing) {
        const newStatus = mapZernioStatus(zPost.status)
        const hasChanges =
          existing.lateStatus !== zPost.status ||
          (zPost.text && existing.caption !== zPost.text)

        if (hasChanges) {
          await db.socialPost.update({
            where: { id: existing.id },
            data: {
              lateStatus: zPost.status,
              status: newStatus,
              caption: zPost.text || existing.caption,
              lastSyncAt: new Date(),
              ...(zPost.publishedAt ? {
                latePublishedAt: new Date(zPost.publishedAt),
                sentAt: new Date(zPost.publishedAt),
              } : {}),
              ...(zPost.permalink ? { publishedUrl: zPost.permalink } : {}),
              ...(zPost.platformPostId ? { instagramMediaId: zPost.platformPostId } : {}),
            },
          })
          updated++
        } else {
          skipped++
        }
        continue
      }

      // New post — import
      const igPlatform = zPost.platforms?.find((p: any) => p.platform === 'instagram')
      const postType = igPlatform ? mapZernioPostType(igPlatform) : PostType.POST
      const mediaUrls = zPost.media?.map((m: any) => m.url).filter(Boolean) || []

      await db.socialPost.create({
        data: {
          projectId: project.id,
          userId: project.userId,
          laterPostId: zPost.id,
          postType,
          caption: zPost.text || '',
          mediaUrls,
          scheduleType: zPost.publishAt ? ScheduleType.SCHEDULED : ScheduleType.IMMEDIATE,
          scheduledDatetime: zPost.publishAt ? new Date(zPost.publishAt) : null,
          status: mapZernioStatus(zPost.status),
          lateStatus: zPost.status,
          publishType: PublishType.DIRECT,
          verificationStatus: postType === PostType.STORY
            ? (zPost.status === 'published' ? VerificationStatus.VERIFIED : VerificationStatus.PENDING)
            : VerificationStatus.SKIPPED,
          renderStatus: RenderStatus.NOT_NEEDED,
          lastSyncAt: new Date(),
          ...(zPost.publishedAt ? {
            sentAt: new Date(zPost.publishedAt),
            latePublishedAt: new Date(zPost.publishedAt),
          } : {}),
          ...(zPost.permalink ? { publishedUrl: zPost.permalink } : {}),
          ...(zPost.platformPostId ? { instagramMediaId: zPost.platformPostId } : {}),
        },
      })
      imported++
    }

    return NextResponse.json({
      success: true,
      sync: { imported, updated, skipped, total: zernioPosts.length },
    })
  } catch (error) {
    console.error('[Sync Zernio] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
