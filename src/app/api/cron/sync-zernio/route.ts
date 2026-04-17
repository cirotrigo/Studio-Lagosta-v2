/**
 * Cron job for Zernio → DB sync
 * Imports posts created externally (via Zernio dashboard/MCP) into local DB
 * Runs every 10 minutes
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLaterClient } from '@/lib/later'
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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron Sync Zernio] Starting sync...')

    const client = getLaterClient()

    // Find all projects with laterAccountId configured
    const projects = await db.project.findMany({
      where: { laterAccountId: { not: null } },
      select: { id: true, laterAccountId: true, userId: true },
    })

    if (projects.length === 0) {
      return NextResponse.json({ success: true, message: 'No projects with Zernio configured' })
    }

    // Build accountId → project map
    const accountToProject = new Map<string, typeof projects[0]>()
    for (const project of projects) {
      accountToProject.set(project.laterAccountId!, project)
    }

    // Fetch ALL scheduled posts from Zernio with pagination
    let allZernioPosts: any[] = []
    let page = 1
    while (true) {
      const posts = await client.listPosts({ limit: 50, status: 'scheduled', page })
      if (!posts || posts.length === 0) break
      allZernioPosts.push(...posts)
      if (posts.length < 50) break
      page++
    }

    console.log(`[Cron Sync Zernio] Fetched ${allZernioPosts.length} scheduled posts from Zernio`)

    let totalImported = 0
    let totalUpdated = 0
    let totalSkipped = 0

    for (const zPost of allZernioPosts) {
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
          totalUpdated++
        } else {
          totalSkipped++
        }
        continue
      }

      // New post — find matching project by accountId from platforms
      let project: typeof projects[0] | undefined
      for (const pl of (zPost.platforms || [])) {
        // accountId can be a string or an object { _id: "..." }
        const accId = typeof pl.accountId === 'object' && pl.accountId
          ? pl.accountId._id
          : pl.accountId
        if (accId && accountToProject.has(accId)) {
          project = accountToProject.get(accId)
          break
        }
      }

      if (!project) {
        totalSkipped++
        continue
      }

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
      totalImported++
    }

    const result = { imported: totalImported, updated: totalUpdated, skipped: totalSkipped }
    console.log('[Cron Sync Zernio] Complete:', result)

    return NextResponse.json({ success: true, sync: result })
  } catch (error) {
    console.error('[Cron Sync Zernio] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
