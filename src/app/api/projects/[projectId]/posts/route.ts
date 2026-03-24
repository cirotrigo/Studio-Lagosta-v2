import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostScheduler } from '@/lib/posts/scheduler'
import { PostType, ScheduleType, RecurrenceFrequency, PublishType } from '../../../../../../prisma/generated/client'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

// Dynamic validation schema based on post type
const createPostValidationSchema = (postType?: PostType) => {
  const isStory = postType === PostType.STORY

  return z.object({
    postType: z.nativeEnum(PostType),
    caption: isStory
      ? z.string().max(2200).optional().default('')
      : z.string().min(1, 'Caption is required').max(2200),

    // Accept either generationIds OR mediaUrls (at least one required)
    generationIds: z.array(z.string()).optional().default([]),
    mediaUrls: z.array(z.string().url()).optional(),
    blobPathnames: z.array(z.string()).optional().default([]),

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
    reminderExtraInfo: z.string().optional(),
    publishType: z.nativeEnum(PublishType).optional().default(PublishType.DIRECT),
    // Template-based scheduling (Stories only)
    pageId: z.string().optional(),
    templateId: z.number().optional(),
    slotValues: z.record(z.unknown()).optional(),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: projectIdParam } = await params

  // CRITICAL DEBUG LOG - Version timestamp to confirm new code is deployed
  console.log('🚀🚀🚀 [API Route POST /posts] ENTRY POINT - Build timestamp:', new Date().toISOString())
  console.log('🚀🚀🚀 [API Route] ProjectId param:', projectIdParam)

  try {
    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const projectId = parseInt(projectIdParam)

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        organizationProjects: {
          include: {
            organization: {
              select: {
                clerkOrgId: true,
                name: true,
              },
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

    // Validate Instagram configuration
    if (!project.instagramAccountId) {
      return NextResponse.json(
        { error: 'Instagram account not configured for this project' },
        { status: 400 }
      )
    }

    // Validate data
    const body = await req.json()
    console.log('📥 Received post data:', JSON.stringify(body, null, 2))

    // First parse to get postType, then validate with appropriate schema
    const baseData = z.object({ postType: z.nativeEnum(PostType) }).parse(body)
    const schema = createPostValidationSchema(baseData.postType)
    const data = schema.parse(body)
    console.log('✅ Validated data:', JSON.stringify(data, null, 2))

    // Template-based story: pageId replaces mediaUrls requirement
    const isTemplateBased = data.postType === 'STORY' && data.pageId

    // Determine media URLs source
    let mediaUrls: string[]
    let generationId: string | undefined

    if (isTemplateBased) {
      // Template-based: no media needed now, will be rendered server-side
      mediaUrls = []
      generationId = data.generationIds?.[0]
    } else if (data.mediaUrls && data.mediaUrls.length > 0) {
      // Direct media URLs (from upload or Google Drive)
      mediaUrls = data.mediaUrls
      generationId = data.generationIds?.[0] // Optional generation link
    } else if (data.generationIds && data.generationIds.length > 0) {
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

      mediaUrls = generations.map(g => g.resultUrl).filter(Boolean) as string[]
      generationId = data.generationIds[0]
    } else {
      return NextResponse.json(
        { error: 'Either generationIds, mediaUrls, or pageId is required' },
        { status: 400 }
      )
    }

    if (mediaUrls.length === 0 && !isTemplateBased) {
      return NextResponse.json(
        { error: 'No media URLs found' },
        { status: 400 }
      )
    }

    // Create post using the scheduler
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥')
    console.log('[API Route] BEFORE calling PostScheduler.createPost()')
    console.log('[API Route] postType:', data.postType)
    console.log('[API Route] scheduleType:', data.scheduleType)
    console.log('[API Route] mediaUrls:', mediaUrls)
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥')

    const scheduler = new PostScheduler()

    console.log('[API Route] PostScheduler instance created')
    console.log('[API Route] Calling scheduler.createPost()...')

    const result = await scheduler.createPost({
      projectId,
      userId: user.id,
      generationId, // Optional now
      mediaUrls,
      blobPathnames: data.blobPathnames || [],
      postType: data.postType,
      caption: data.caption,
      scheduleType: data.scheduleType,
      scheduledDatetime: data.scheduledDatetime,
      recurringConfig: data.recurringConfig ? {
        frequency: data.recurringConfig.frequency,
        daysOfWeek: data.recurringConfig.daysOfWeek,
        time: data.recurringConfig.time,
        endDate: data.recurringConfig.endDate,
      } : undefined,
      altText: data.altText,
      firstComment: data.firstComment,
      publishType: data.publishType || PublishType.DIRECT,
      reminderExtraInfo: data.reminderExtraInfo,
      pageId: data.pageId,
      templateId: data.templateId,
      slotValues: data.slotValues,
    })

    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥')
    console.log('[API Route] AFTER scheduler.createPost()')
    console.log('[API Route] Result:', JSON.stringify(result))
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥')

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error creating post:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    // Return detailed error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Detailed error:', errorMessage, error)

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    )
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: projectIdParam } = await params
  try {
    const { userId: clerkUserId, orgId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = parseInt(projectIdParam)

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

    const posts = await db.socialPost.findMany({
      where: {
        projectId,
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
