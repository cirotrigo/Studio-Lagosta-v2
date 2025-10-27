import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const projectIdsParam = url.searchParams.get('projectIds')

    if (!projectIdsParam) {
      return NextResponse.json({ error: 'projectIds parameter required' }, { status: 400 })
    }

    const projectIds = projectIdsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))

    if (projectIds.length === 0) {
      return NextResponse.json({ summaries: [] })
    }

    // Verificar acesso aos projetos
    const projects = await db.project.findMany({
      where: {
        id: { in: projectIds },
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

    if (projects.length === 0) {
      return NextResponse.json({ summaries: [] })
    }

    // Buscar dados do Instagram para cada projeto
    const currentWeekStart = getWeekStart(new Date())

    const summaries = await Promise.all(
      projects.map(async (project) => {
        // Se não tem username do Instagram, retornar null
        if (!project.instagramUsername) {
          return {
            projectId: project.id,
            hasInstagram: false,
            data: null,
          }
        }

        // Buscar relatório da semana atual
        const weeklyReport = await db.instagramWeeklyReport.findUnique({
          where: {
            projectId_weekStart: {
              projectId: project.id,
              weekStart: currentWeekStart,
            },
          },
          select: {
            feedsPublished: true,
            feedsGoal: true,
            feedsCompletionRate: true,
            storiesPublished: true,
            storiesGoal: true,
            storiesCompletionRate: true,
            overallCompletionRate: true,
            score: true,
            daysWithoutPost: true,
            alerts: true,
          },
        })

        // Se não tem relatório da semana, calcular dados básicos
        if (!weeklyReport) {
          const weekEnd = new Date(currentWeekStart)
          weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

          const [feedsCount, storiesCount] = await Promise.all([
            db.instagramFeed.count({
              where: {
                projectId: project.id,
                publishedAt: {
                  gte: currentWeekStart,
                  lt: weekEnd,
                },
                countedInGoal: true,
              },
            }),
            db.instagramStory.count({
              where: {
                projectId: project.id,
                publishedAt: {
                  gte: currentWeekStart,
                  lt: weekEnd,
                },
                countedInGoal: true,
              },
            }),
          ])

          const feedsGoal = 4
          const storiesGoal = 21
          const feedsCompletionRate = (feedsCount / feedsGoal) * 100
          const storiesCompletionRate = (storiesCount / storiesGoal) * 100
          const overallCompletionRate = (feedsCompletionRate + storiesCompletionRate) / 2

          return {
            projectId: project.id,
            hasInstagram: true,
            data: {
              username: project.instagramUsername,
              feedsPublished: feedsCount,
              feedsGoal,
              feedsCompletionRate,
              storiesPublished: storiesCount,
              storiesGoal,
              storiesCompletionRate,
              overallCompletionRate,
              score: calculateScore(overallCompletionRate),
              daysWithoutPost: 0,
              alerts: [],
            },
          }
        }

        return {
          projectId: project.id,
          hasInstagram: true,
          data: {
            username: project.instagramUsername,
            feedsPublished: weeklyReport.feedsPublished,
            feedsGoal: weeklyReport.feedsGoal,
            feedsCompletionRate: weeklyReport.feedsCompletionRate,
            storiesPublished: weeklyReport.storiesPublished,
            storiesGoal: weeklyReport.storiesGoal,
            storiesCompletionRate: weeklyReport.storiesCompletionRate,
            overallCompletionRate: weeklyReport.overallCompletionRate,
            score: weeklyReport.score,
            daysWithoutPost: weeklyReport.daysWithoutPost,
            alerts: weeklyReport.alerts as any[] || [],
          },
        }
      })
    )

    return NextResponse.json({ summaries })
  } catch (error) {
    console.error('Error fetching Instagram summaries:', error)
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
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  return d
}

function calculateScore(completionRate: number): string {
  if (completionRate >= 90) return 'A'
  if (completionRate >= 80) return 'B'
  if (completionRate >= 70) return 'C'
  if (completionRate >= 60) return 'D'
  return 'F'
}
