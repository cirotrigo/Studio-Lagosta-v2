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

    const posts = await db.socialPost.findMany({
      where: {
        projectId,
        userId: user.id,
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
      orderBy: { scheduledDatetime: 'asc' },
    })

    return NextResponse.json(posts)

  } catch (error) {
    console.error('Error fetching calendar posts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
