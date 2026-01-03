import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { PostType } from '../../../../../../../prisma/generated/client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: projectIdParam } = await params
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Note: We don't need to get the user anymore since we removed userId filter
    // This allows all organization members to see posts from the shared project
    const projectId = parseInt(projectIdParam)

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const postTypeParam = searchParams.get('postType')
    const postType = postTypeParam ? (postTypeParam as PostType) : null

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }

    // Fetch regular scheduled and sent posts
    // Note: Removed userId filter to allow all organization members to see posts
    // OPTIMIZATION: Limit results, optimize includes, and use indexed fields
    const scheduledPosts = await db.socialPost.findMany({
      where: {
        projectId,
        scheduleType: { in: ['SCHEDULED', 'IMMEDIATE'] },
        ...(postType ? { postType } : {}),
        OR: [
          {
            // Scheduled posts in the period
            scheduledDatetime: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
          {
            // Already sent posts in the period
            status: 'POSTED',
            sentAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        ],
      },
      select: {
        // Only select needed fields instead of full include
        id: true,
        projectId: true,
        generationId: true,
        userId: true,
        postType: true,
        caption: true,
        mediaUrls: true,
        altText: true,
        firstComment: true,
        publishType: true,
        reminderSentAt: true,
        scheduleType: true,
        scheduledDatetime: true,
        recurringConfig: true,
        status: true,
        sentAt: true,
        failedAt: true,
        errorMessage: true,
        publishedUrl: true,
        instagramMediaId: true,
        verificationTag: true,
        verificationStatus: true,
        verificationAttempts: true,
        verifiedByFallback: true,
        verifiedStoryId: true,
        verifiedPermalink: true,
        verificationError: true,
        isRecurring: true,
        createdAt: true,
        updatedAt: true,
        Generation: {
          select: {
            id: true,
            templateName: true,
            resultUrl: true,
          },
        },
        Project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            Logo: {
              where: {
                isProjectLogo: true,
              },
              select: {
                fileUrl: true,
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        scheduledDatetime: 'asc',
      },
      take: 500, // Limit to prevent performance issues
    })

    // Fetch active recurring posts
    // Note: Removed userId filter to allow all organization members to see posts
    // OPTIMIZATION: Use select instead of include, add limit
    const recurringPosts = await db.socialPost.findMany({
      where: {
        projectId,
        scheduleType: 'RECURRING',
        status: { in: ['SCHEDULED', 'POSTING'] },
        ...(postType ? { postType } : {}),
      },
      select: {
        // Only select needed fields
        id: true,
        projectId: true,
        generationId: true,
        userId: true,
        postType: true,
        caption: true,
        mediaUrls: true,
        altText: true,
        firstComment: true,
        publishType: true,
        reminderSentAt: true,
        scheduleType: true,
        scheduledDatetime: true,
        recurringConfig: true,
        status: true,
        sentAt: true,
        failedAt: true,
        errorMessage: true,
        publishedUrl: true,
        instagramMediaId: true,
        createdAt: true,
        updatedAt: true,
        Generation: {
          select: {
            id: true,
            templateName: true,
            resultUrl: true,
          },
        },
        Project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            Logo: {
              where: {
                isProjectLogo: true,
              },
              select: {
                fileUrl: true,
              },
              take: 1,
            },
          },
        },
      },
      take: 100, // Limit recurring posts
    })

    // Filter and expand recurring posts
    const rangeStart = new Date(startDate)
    const now = new Date()

    const expandedRecurringPosts = recurringPosts.filter(post => {
      if (!post.recurringConfig || typeof post.recurringConfig !== 'object') return false

      const config = post.recurringConfig as { endDate?: string }
      if (config.endDate) {
        const endDate = new Date(config.endDate)
        if (endDate < now) return false
      }

      return true
    }).map(post => ({
      ...post,
      scheduledDatetime: rangeStart,
      isRecurringPlaceholder: true,
    }))

    // Combine and sort
    const allPosts = [...scheduledPosts, ...expandedRecurringPosts].sort((a, b) => {
      const dateA = a.scheduledDatetime?.getTime() || 0
      const dateB = b.scheduledDatetime?.getTime() || 0
      return dateA - dateB
    })

    return NextResponse.json(allPosts)

  } catch (error) {
    console.error('[CALENDAR_POSTS_GET] Error fetching calendar posts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
