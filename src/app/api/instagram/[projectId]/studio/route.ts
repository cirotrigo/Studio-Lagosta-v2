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

    // Buscar dados de posts Later (SocialPost)
    const currentWeekStart = getWeekStart(new Date())

    const allPosts = await db.socialPost.findMany({
      where: {
        projectId,
        laterPostId: { not: null },
        status: 'POSTED',
      },
      select: {
        id: true,
        postType: true,
        caption: true,
        sentAt: true,
        mediaUrls: true,
        analyticsLikes: true,
        analyticsComments: true,
        analyticsShares: true,
        analyticsReach: true,
        analyticsImpressions: true,
        analyticsEngagement: true,
        publishedUrl: true,
      },
      orderBy: { sentAt: 'desc' },
    })

    // Calcular weekly report a partir dos posts
    const weeklyReport = calculateWeeklyReport(allPosts, currentWeekStart)

    // Calcular daily summaries
    const dailySummaries = calculateDailySummaries(allPosts, currentWeekStart)

    // Separar stories e feeds recentes
    const recentPosts = allPosts.slice(0, 30)
    const recentStories = recentPosts.filter((p) => p.postType === 'STORY')
    const recentFeeds = recentPosts.filter((p) => p.postType === 'POST')

    return NextResponse.json({
      username: project.instagramUsername,
      currentWeek: weeklyReport,
      dailySummaries,
      recentStories: recentStories.map((post) => ({
        id: post.id,
        mediaUrl: post.mediaUrls?.[0] || null,
        caption: post.caption || null,
        publishedAt: post.sentAt,
        impressions: post.analyticsImpressions || 0,
        reach: post.analyticsReach || 0,
        tapsForward: 0, // Later API não fornece
        tapsBack: 0, // Later API não fornece
        exits: 0, // Later API não fornece
        replies: post.analyticsComments || 0,
      })),
      recentFeeds: recentFeeds.map((post) => ({
        id: post.id,
        media_url: post.mediaUrls?.[0] || null,
        caption: post.caption || null,
        permalink: post.publishedUrl || null,
        likes: post.analyticsLikes || 0,
        comments: post.analyticsComments || 0,
        engagement: post.analyticsEngagement || 0,
        impressions: post.analyticsImpressions || 0,
        reach: post.analyticsReach || 0,
        saved: 0, // Later API não fornece
      })),
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

function calculateWeeklyReport(
  posts: any[],
  weekStart: Date
) {
  // Filtrar posts desta semana
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const weekPosts = posts.filter((p) => {
    const postDate = new Date(p.sentAt)
    return postDate >= weekStart && postDate < weekEnd
  })

  // Contar por tipo
  const stories = weekPosts.filter((p) => p.postType === 'STORY')
  const feeds = weekPosts.filter((p) => p.postType === 'POST')

  // Metas padrão (configuráveis depois)
  const feedGoal = 4
  const storyGoal = 21

  const feedsCompletionRate = Math.round((feeds.length / feedGoal) * 100)
  const storiesCompletionRate = Math.round((stories.length / storyGoal) * 100)
  const overallRate = (feedsCompletionRate + storiesCompletionRate) / 2

  // Calcular score
  const score = getScore(overallRate / 100)

  // Calcular alertas
  const alerts = []
  if (feedsCompletionRate < 100) {
    alerts.push({
      type: 'BELOW_GOAL',
      category: 'feeds',
      message: `${feedGoal - feeds.length} feed(s) abaixo da meta semanal`,
      severity: 'warning',
    })
  }
  if (storiesCompletionRate < 100) {
    alerts.push({
      type: 'BELOW_GOAL',
      category: 'stories',
      message: `${storyGoal - stories.length} story(ies) abaixo da meta semanal`,
      severity: 'warning',
    })
  }

  const totalLikes = weekPosts.reduce((sum, p) => sum + (p.analyticsLikes || 0), 0)
  const totalComments = weekPosts.reduce((sum, p) => sum + (p.analyticsComments || 0), 0)
  const totalReach = weekPosts.reduce((sum, p) => sum + (p.analyticsReach || 0), 0)

  return {
    weekStart,
    feedsPublished: feeds.length,
    feedsGoal: feedGoal,
    feedsCompletionRate,
    storiesPublished: stories.length,
    storiesGoal: storyGoal,
    storiesCompletionRate,
    overallCompletionRate: Math.round(overallRate),
    score,
    totalLikes,
    totalComments,
    totalReach,
    daysWithoutPost: calculateDaysWithoutPost(weekPosts),
    alerts,
  }
}

function calculateDailySummaries(posts: any[], weekStart: Date) {
  const dailySummaries = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)

    if (date > today) break

    const dayPosts = posts.filter((p) => {
      const postDate = new Date(p.sentAt)
      postDate.setHours(0, 0, 0, 0)
      return postDate.getTime() === date.getTime()
    })

    const storiesCount = dayPosts.filter((p) => p.postType === 'STORY').length
    const storyGoal = 3

    dailySummaries.push({
      date,
      storiesPublished: storiesCount,
      storiesGoal: storyGoal,
      feedsPublished: dayPosts.filter((p) => p.postType === 'POST').length,
      goalMet: storiesCount >= storyGoal,
    })
  }

  return dailySummaries
}

function calculateDaysWithoutPost(posts: any[]): number {
  if (posts.length === 0) return 7

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lastPost = posts[0]
  const lastPostDate = new Date(lastPost.sentAt)
  lastPostDate.setHours(0, 0, 0, 0)

  const daysAgo = Math.floor((today.getTime() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24))

  return daysAgo
}

function getScore(completionRate: number): string {
  if (completionRate >= 0.9) return 'A'
  if (completionRate >= 0.8) return 'B'
  if (completionRate >= 0.7) return 'C'
  if (completionRate >= 0.6) return 'D'
  return 'F'
}
