import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const InstagramFeedPayloadSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']),
  media_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  permalink: z.string().url(),
  timestamp: z.string().datetime(),
  username: z.string(),
  likes: z.number().int().min(0),
  comments: z.number().int().min(0),
  insights: z.object({
    engagement: z.number().int().min(0),
    impressions: z.number().int().min(0),
    reach: z.number().int().min(0),
    saved: z.number().int().min(0),
  }),
  captured_at: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Validar webhook secret
    const webhookSecret = request.headers.get('x-webhook-secret')
    if (webhookSecret !== process.env.INSTAGRAM_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Invalid webhook secret' },
        { status: 401 }
      )
    }

    // 2. Validar payload
    const body = await request.json()
    const data = InstagramFeedPayloadSchema.parse(body)

    // 3. Buscar projeto
    const project = await db.project.findFirst({
      where: {
        instagramUsername: data.username,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        organizationProjects: {
          select: { organizationId: true },
          take: 1,
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const organizationId = project.organizationProjects[0]?.organizationId || null

    // 4. Upsert feed
    await db.instagramFeed.upsert({
      where: {
        mediaId: data.id,
      },
      create: {
        projectId: project.id,
        organizationId,
        mediaId: data.id,
        username: data.username,
        mediaType: data.media_type,
        caption: data.caption || null,
        mediaUrl: data.media_url,
        thumbnailUrl: data.thumbnail_url || null,
        permalink: data.permalink,
        publishedAt: new Date(data.timestamp),
        capturedAt: new Date(data.captured_at),
        likes: data.likes,
        comments: data.comments,
        engagement: data.insights.engagement,
        impressions: data.insights.impressions,
        reach: data.insights.reach,
        saved: data.insights.saved,
      },
      update: {
        likes: data.likes,
        comments: data.comments,
        engagement: data.insights.engagement,
        impressions: data.insights.impressions,
        reach: data.insights.reach,
        saved: data.insights.saved,
        updatedAt: new Date(),
      },
    })

    // 5. Atualizar sumário diário (apenas contador de feeds)
    const feedDate = new Date(data.timestamp)
    feedDate.setUTCHours(0, 0, 0, 0)

    await updateDailySummaryForFeed(project.id, organizationId, data.username, feedDate)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error processing Instagram feed webhook:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function updateDailySummaryForFeed(
  projectId: number,
  organizationId: string | null,
  username: string,
  date: Date
) {
  const feedsCount = await db.instagramFeed.count({
    where: {
      projectId,
      publishedAt: {
        gte: date,
        lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      },
      countedInGoal: true,
    },
  })

  const feedEngagement = await db.instagramFeed.aggregate({
    where: {
      projectId,
      publishedAt: {
        gte: date,
        lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      },
      countedInGoal: true,
    },
    _sum: {
      engagement: true,
    },
  })

  // Atualizar apenas o contador de feeds
  await db.instagramDailySummary.upsert({
    where: {
      projectId_date: {
        projectId,
        date,
      },
    },
    create: {
      projectId,
      organizationId,
      username,
      date,
      storiesGoal: 3, // Valor padrão
      feedsPublished: feedsCount,
      totalFeedEngagement: feedEngagement._sum.engagement || 0,
    },
    update: {
      feedsPublished: feedsCount,
      totalFeedEngagement: feedEngagement._sum.engagement || 0,
    },
  })
}
