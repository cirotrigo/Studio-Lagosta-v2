import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
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

    const user = await getUserFromClerkId(clerkUserId)
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
    const scheduledPosts = await db.socialPost.findMany({
      where: {
        projectId,
        userId: user.id,
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
            status: 'SENT',
            sentAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        ],
      },
      include: {
        Generation: {
          select: {
            id: true,
            templateName: true,
            resultUrl: true,
          },
        },
      },
    })

    // Fetch active recurring posts
    const recurringPosts = await db.socialPost.findMany({
      where: {
        projectId,
        userId: user.id,
        scheduleType: 'RECURRING',
        status: { in: ['SCHEDULED', 'PROCESSING'] },
        ...(postType ? { postType } : {}),
      },
      include: {
        Generation: {
          select: {
            id: true,
            templateName: true,
            resultUrl: true,
          },
        },
      },
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
    console.error('Error fetching calendar posts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
