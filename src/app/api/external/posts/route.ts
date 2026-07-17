import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { PostScheduler } from '@/lib/posts/scheduler'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { PostType, PostStatus, ScheduleType } from '../../../../../prisma/generated/client'

export const maxDuration = 120

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

const createPostSchema = z
  .object({
    projectId: z.number().int().positive(),
    postType: z.nativeEnum(PostType),
    caption: z.string().max(2200).optional().default(''),
    mediaUrls: z.array(z.string().url()).min(1),
    scheduleType: z
      .enum([ScheduleType.SCHEDULED, ScheduleType.IMMEDIATE])
      .optional()
      .default(ScheduleType.SCHEDULED),
    scheduledDatetime: z.string().datetime().optional(),
    altText: z.array(z.string()).optional(),
    firstComment: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.postType !== PostType.STORY && !data.caption) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caption'],
        message: 'Caption is required for non-story posts',
      })
    }
    if (data.scheduleType === ScheduleType.SCHEDULED && !data.scheduledDatetime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledDatetime'],
        message: 'scheduledDatetime is required when scheduleType is SCHEDULED',
      })
    }
  })

// POST /api/external/posts — create a post (published via Zernio by the existing pipeline)
export async function POST(req: NextRequest) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = createPostSchema.parse(await req.json())

    const project = await db.project.findUnique({
      where: { id: data.projectId },
      select: { id: true, userId: true, instagramAccountId: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.instagramAccountId) {
      return NextResponse.json(
        { error: 'Instagram account not configured for this project' },
        { status: 400 }
      )
    }

    const scheduler = new PostScheduler()
    const result = await scheduler.createPost({
      projectId: project.id,
      userId: project.userId,
      postType: data.postType,
      caption: data.caption,
      mediaUrls: data.mediaUrls,
      scheduleType: data.scheduleType,
      scheduledDatetime: data.scheduledDatetime,
      altText: data.altText,
      firstComment: data.firstComment,
    })

    const post = await db.socialPost.findUnique({
      where: { id: result.postId },
      select: POST_SUMMARY_SELECT,
    })

    return NextResponse.json({ success: true, post }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[External API] Error creating post:', error)
    return NextResponse.json(
      { error: 'Failed to create post', details: message },
      { status: 500 }
    )
  }
}

const listQuerySchema = z.object({
  projectId: z.coerce.number().int().positive(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.string().optional(), // comma-separated PostStatus values
  postType: z.string().optional(), // comma-separated PostType values
  limit: z.coerce.number().int().positive().max(500).optional().default(200),
})

const parseEnumList = <T extends Record<string, string>>(
  raw: string | undefined,
  enumObject: T
): T[keyof T][] | undefined => {
  if (!raw) return undefined
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T[keyof T] & string =>
      Object.values(enumObject).includes(value)
    )
  return values.length > 0 ? (values as T[keyof T][]) : undefined
}

// GET /api/external/posts?projectId=&from=&to=&status=&postType= — agenda window
export async function GET(req: NextRequest) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const query = listQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    )

    const statusFilter = parseEnumList(query.status, PostStatus)
    const postTypeFilter = parseEnumList(query.postType, PostType)

    const posts = await db.socialPost.findMany({
      where: {
        projectId: query.projectId,
        ...(query.from || query.to
          ? {
              scheduledDatetime: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(postTypeFilter ? { postType: { in: postTypeFilter } } : {}),
      },
      select: POST_SUMMARY_SELECT,
      orderBy: { scheduledDatetime: 'asc' },
      take: query.limit,
    })

    return NextResponse.json({ posts, count: posts.length })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('[External API] Error listing posts:', error)
    return NextResponse.json({ error: 'Failed to list posts' }, { status: 500 })
  }
}
