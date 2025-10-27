import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

// Validação do payload
const InstagramStoryPayloadSchema = z.object({
  media_id: z.string(),
  username: z.string(),
  media_type: z.enum(['IMAGE', 'VIDEO']),
  media_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  caption: z.string().optional(),
  timestamp: z.string().datetime(),
  insights: z.object({
    impressions: z.number().int().min(0),
    reach: z.number().int().min(0),
    taps_forward: z.number().int().min(0),
    taps_back: z.number().int().min(0),
    exits: z.number().int().min(0),
    replies: z.number().int().min(0),
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
    const data = InstagramStoryPayloadSchema.parse(body)

    // 3. Buscar projeto pelo username do Instagram
    const project = await db.project.findFirst({
      where: {
        instagramUsername: data.username,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        workspaceId: true,
        organizationProjects: {
          select: {
            organizationId: true,
          },
          take: 1,
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found for username' },
        { status: 404 }
      )
    }

    const organizationId = project.organizationProjects[0]?.organizationId || null

    // 4. Upsert story
    await db.instagramStory.upsert({
      where: {
        mediaId: data.media_id,
      },
      create: {
        projectId: project.id,
        organizationId,
        mediaId: data.media_id,
        username: data.username,
        mediaType: data.media_type,
        mediaUrl: data.media_url,
        thumbnailUrl: data.thumbnail_url || null,
        caption: data.caption || null,
        publishedAt: new Date(data.timestamp),
        capturedAt: new Date(data.captured_at),
        impressions: data.insights.impressions,
        reach: data.insights.reach,
        tapsForward: data.insights.taps_forward,
        tapsBack: data.insights.taps_back,
        exits: data.insights.exits,
        replies: data.insights.replies,
      },
      update: {
        impressions: data.insights.impressions,
        reach: data.insights.reach,
        tapsForward: data.insights.taps_forward,
        tapsBack: data.insights.taps_back,
        exits: data.insights.exits,
        replies: data.insights.replies,
        updatedAt: new Date(),
      },
    })

    // 5. Atualizar sumário diário
    const storyDate = new Date(data.timestamp)
    storyDate.setUTCHours(0, 0, 0, 0)

    await updateDailySummary(project.id, organizationId, data.username, storyDate)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error processing Instagram story webhook:', error)

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

// Função auxiliar para atualizar sumário diário
async function updateDailySummary(
  projectId: number,
  organizationId: string | null,
  username: string,
  date: Date
) {
  // Buscar configurações de meta
  const settings = await db.instagramGoalSettings.findUnique({
    where: { projectId },
    select: { dailyStoryGoal: true },
  })

  const dailyGoal = settings?.dailyStoryGoal || 3

  // Contar stories do dia
  const storiesCount = await db.instagramStory.count({
    where: {
      projectId,
      publishedAt: {
        gte: date,
        lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      },
      countedInGoal: true,
    },
  })

  // Calcular estatísticas
  const stats = await db.instagramStory.aggregate({
    where: {
      projectId,
      publishedAt: {
        gte: date,
        lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      },
      countedInGoal: true,
    },
    _sum: {
      reach: true,
      impressions: true,
    },
  })

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

  const completionRate = (storiesCount / dailyGoal) * 100

  // Upsert sumário diário
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
      storiesGoal: dailyGoal,
      storiesPublished: storiesCount,
      feedsPublished: feedsCount,
      storiesCompletionRate: completionRate,
      goalMet: storiesCount >= dailyGoal,
      totalStoryReach: stats._sum.reach || 0,
      totalStoryImpressions: stats._sum.impressions || 0,
    },
    update: {
      storiesPublished: storiesCount,
      feedsPublished: feedsCount,
      storiesCompletionRate: completionRate,
      goalMet: storiesCount >= dailyGoal,
      totalStoryReach: stats._sum.reach || 0,
      totalStoryImpressions: stats._sum.impressions || 0,
    },
  })
}
