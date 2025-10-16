import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostScheduler } from '@/lib/posts/scheduler'
import { PostType, ScheduleType, RecurrenceFrequency } from '../../../../../../prisma/generated/client'

const createPostSchema = z.object({
  postType: z.nativeEnum(PostType),
  caption: z.string().max(2200),
  generationIds: z.array(z.string()).min(1),
  scheduleType: z.nativeEnum(ScheduleType),
  scheduledDatetime: z.string().datetime().optional(),
  recurringConfig: z.object({
    frequency: z.nativeEnum(RecurrenceFrequency),
    daysOfWeek: z.array(z.number()).optional(),
    time: z.string(),
    endDate: z.string().datetime().optional(),
  }).optional(),
  altText: z.array(z.string()).optional(),
  firstComment: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(params.projectId)

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: user.id },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Validate data
    const body = await req.json()
    const data = createPostSchema.parse(body)

    // Fetch URLs from generations
    const generations = await db.generation.findMany({
      where: {
        id: { in: data.generationIds },
        projectId: projectId,
      },
      select: { id: true, resultUrl: true },
    })

    if (generations.length !== data.generationIds.length) {
      return NextResponse.json(
        { error: 'Some generations not found' },
        { status: 404 }
      )
    }

    const mediaUrls = generations.map(g => g.resultUrl).filter(Boolean) as string[]

    // Create post using the scheduler
    const scheduler = new PostScheduler()
    const result = await scheduler.createPost({
      ...data,
      projectId,
      userId: user.id,
      generationId: data.generationIds[0], // Link to first creative
      mediaUrls,
    })

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error creating post:', error)

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

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(params.projectId)

    const posts = await db.socialPost.findMany({
      where: {
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
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(posts)

  } catch (error) {
    console.error('Error fetching posts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
