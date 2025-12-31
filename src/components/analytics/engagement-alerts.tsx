'use client'

import { ProjectAnalyticsSummary, PostAnalyticsItem } from '@/hooks/use-project-analytics'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, TrendingDown, Calendar, Target } from 'lucide-react'

interface EngagementAlertsProps {
  summary: ProjectAnalyticsSummary
  posts: PostAnalyticsItem[]
}

export function EngagementAlerts({ summary, posts }: EngagementAlertsProps) {
  const alerts: Array<{
    type: 'warning' | 'info'
    title: string
    description: string
    icon: React.ReactNode
  }> = []

  // Alert 1: Low average engagement rate
  if (summary.avgEngagementRate < 2 && summary.postsWithAnalytics > 0) {
    alerts.push({
      type: 'warning',
      title: 'Taxa de Engagement Baixa',
      description: `Sua taxa média de engagement está em ${summary.avgEngagementRate.toFixed(1)}%. O ideal é acima de 3% para contas pequenas e médias.`,
      icon: <AlertTriangle className="h-4 w-4" />,
    })
  }

  // Alert 2: Declining engagement trend
  if (posts.length >= 5) {
    const recentPosts = posts.slice(0, 5)
    const olderPosts = posts.slice(5, 10)

    const recentAvgEngagement =
      recentPosts.reduce((sum, p) => sum + (p.analyticsEngagement || 0), 0) /
      recentPosts.length

    const olderAvgEngagement =
      olderPosts.length > 0
        ? olderPosts.reduce((sum, p) => sum + (p.analyticsEngagement || 0), 0) /
          olderPosts.length
        : recentAvgEngagement

    if (recentAvgEngagement < olderAvgEngagement * 0.7) {
      alerts.push({
        type: 'warning',
        title: 'Queda no Engagement Recente',
        description: `Os últimos 5 posts tiveram ${((1 - recentAvgEngagement / olderAvgEngagement) * 100).toFixed(0)}% menos engagement que os posts anteriores. Considere revisar sua estratégia de conteúdo.`,
        icon: <TrendingDown className="h-4 w-4" />,
      })
    }
  }

  // Alert 3: Low reach posts
  const lowReachPosts = posts.filter(
    (p) => p.analyticsReach && p.analyticsReach < summary.totalReach / summary.totalPosts * 0.5
  )

  if (lowReachPosts.length >= 3) {
    alerts.push({
      type: 'info',
      title: `${lowReachPosts.length} Posts com Alcance Baixo`,
      description: `Você tem ${lowReachPosts.length} posts com alcance significativamente abaixo da média. Analise o tipo de conteúdo e horário de publicação.`,
      icon: <Target className="h-4 w-4" />,
    })
  }

  // Alert 4: Best posting time suggestion
  if (posts.length >= 10) {
    const postsByHour = new Map<number, { engagement: number; count: number }>()

    posts.forEach((post) => {
      if (post.sentAt && post.analyticsEngagement) {
        const hour = new Date(post.sentAt).getHours()
        const existing = postsByHour.get(hour) || { engagement: 0, count: 0 }
        postsByHour.set(hour, {
          engagement: existing.engagement + post.analyticsEngagement,
          count: existing.count + 1,
        })
      }
    })

    let bestHour = 0
    let bestAvgEngagement = 0

    postsByHour.forEach((data, hour) => {
      const avgEngagement = data.engagement / data.count
      if (avgEngagement > bestAvgEngagement) {
        bestAvgEngagement = avgEngagement
        bestHour = hour
      }
    })

    if (bestAvgEngagement > 0) {
      alerts.push({
        type: 'info',
        title: 'Melhor Horário para Postar',
        description: `Seus posts publicados às ${bestHour}h têm o melhor engagement médio. Considere agendar mais posts nesse horário.`,
        icon: <Calendar className="h-4 w-4" />,
      })
    }
  }

  if (alerts.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Alertas e Recomendações
          <Badge variant="secondary" className="ml-auto">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert, index) => (
          <Alert
            key={index}
            variant={alert.type === 'warning' ? 'destructive' : 'default'}
            className={
              alert.type === 'warning'
                ? 'border-amber-200 bg-amber-50'
                : 'border-blue-200 bg-blue-50'
            }
          >
            <div className="flex items-start gap-2">
              <div
                className={
                  alert.type === 'warning' ? 'text-amber-600' : 'text-blue-600'
                }
              >
                {alert.icon}
              </div>
              <div className="flex-1">
                <AlertTitle
                  className={
                    alert.type === 'warning'
                      ? 'text-amber-900'
                      : 'text-blue-900'
                  }
                >
                  {alert.title}
                </AlertTitle>
                <AlertDescription
                  className={
                    alert.type === 'warning'
                      ? 'text-amber-700'
                      : 'text-blue-700'
                  }
                >
                  {alert.description}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  )
}
