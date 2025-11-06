import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId: projectIdStr } = await params
    const projectId = parseInt(projectIdStr)

    // Verificar acesso ao projeto
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          {
            organizationProjects: {
              some: {
                organization: {
                  // TODO: Verificar se usuário é membro da organização
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        instagramUsername: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Buscar dados do dashboard
    const currentWeekStart = getWeekStart(new Date())

    const [weeklyReport, dailySummaries, recentStories, recentFeeds] = await Promise.all([
      // Relatório da semana atual
      db.instagramWeeklyReport.findUnique({
        where: {
          projectId_weekStart: {
            projectId,
            weekStart: currentWeekStart,
          },
        },
      }),

      // Resumos diários da semana
      db.instagramDailySummary.findMany({
        where: {
          projectId,
          date: {
            gte: currentWeekStart,
            lte: new Date(),
          },
        },
        orderBy: { date: 'asc' },
      }),

      // Stories recentes (últimos 7 dias)
      db.instagramStory.findMany({
        where: {
          projectId,
          publishedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: 20,
      }),

      // Feeds recentes (últimos 30 dias)
      db.instagramFeed.findMany({
        where: {
          projectId,
          publishedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: 12,
      }),
    ])

    return NextResponse.json({
      username: project.instagramUsername,
      currentWeek: weeklyReport,
      dailySummaries,
      recentStories,
      recentFeeds,
    })
  } catch (error) {
    console.error('Error fetching Instagram dashboard:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // Ajustar para segunda-feira
  d.setUTCDate(diff)
  return d
}
