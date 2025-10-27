import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const WeeklyReportPayloadSchema = z.object({
  organization_id: z.string().optional(),
  instagram_account_id: z.string().optional(),
  username: z.string(),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    type: z.literal('weekly'),
  }),
  metrics: z.object({
    feeds: z.object({
      published: z.number().int(),
      goal: z.number().int(),
      completion_rate: z.number(),
      missing: z.number().int(),
      posts: z.array(z.any()).optional(),
    }),
    stories: z.object({
      published: z.number().int(),
      goal: z.number().int(),
      completion_rate: z.number(),
      missing: z.number().int(),
      daily_breakdown: z.array(z.any()).optional(),
    }),
    overall: z.object({
      completion_rate: z.number(),
      score: z.string(),
      days_without_post: z.number().int(),
      best_day: z.string().optional(),
      worst_day: z.string().optional(),
    }),
  }),
  alerts: z.array(z.object({
    type: z.string(),
    category: z.string(),
    message: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
  })),
  generated_at: z.string().datetime(),
})

export async function POST(request: NextRequest) {
  try {
    // Validar webhook secret
    const webhookSecret = request.headers.get('x-webhook-secret')
    if (webhookSecret !== process.env.INSTAGRAM_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Invalid webhook secret' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const data = WeeklyReportPayloadSchema.parse(body)

    // Buscar projeto
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

    // Calcular semana e ano
    const weekStart = new Date(data.period.start)
    weekStart.setUTCHours(0, 0, 0, 0)

    const weekEnd = new Date(data.period.end)
    weekEnd.setUTCHours(23, 59, 59, 999)

    const year = weekStart.getFullYear()
    const weekNumber = getWeekNumber(weekStart)

    // Criar/atualizar relatório semanal
    await db.instagramWeeklyReport.upsert({
      where: {
        projectId_weekStart: {
          projectId: project.id,
          weekStart,
        },
      },
      create: {
        projectId: project.id,
        organizationId,
        username: data.username,
        weekStart,
        weekEnd,
        year,
        weekNumber,
        feedsGoal: data.metrics.feeds.goal,
        storiesGoal: data.metrics.stories.goal,
        feedsPublished: data.metrics.feeds.published,
        storiesPublished: data.metrics.stories.published,
        feedsCompletionRate: data.metrics.feeds.completion_rate,
        storiesCompletionRate: data.metrics.stories.completion_rate,
        overallCompletionRate: data.metrics.overall.completion_rate,
        score: data.metrics.overall.score,
        daysWithoutPost: data.metrics.overall.days_without_post,
        metricsJson: data.metrics,
        alerts: data.alerts,
        generatedAt: new Date(data.generated_at),
      },
      update: {
        feedsPublished: data.metrics.feeds.published,
        storiesPublished: data.metrics.stories.published,
        feedsCompletionRate: data.metrics.feeds.completion_rate,
        storiesCompletionRate: data.metrics.stories.completion_rate,
        overallCompletionRate: data.metrics.overall.completion_rate,
        score: data.metrics.overall.score,
        daysWithoutPost: data.metrics.overall.days_without_post,
        metricsJson: data.metrics,
        alerts: data.alerts,
        generatedAt: new Date(data.generated_at),
        updatedAt: new Date(),
      },
    })

    // Se há alertas, enviar notificações (implementar depois)
    if (data.alerts.length > 0) {
      // TODO: Enviar notificações por email/Slack
      console.log(`${data.alerts.length} alertas gerados para ${data.username}`)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error processing weekly report webhook:', error)

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

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
