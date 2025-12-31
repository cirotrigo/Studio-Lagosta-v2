'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProjectAnalyticsSummary } from '@/hooks/use-project-analytics'
import {
  Heart,
  MessageCircle,
  Share2,
  Users,
  Eye,
  TrendingUp,
} from 'lucide-react'

interface AnalyticsOverviewCardsProps {
  summary: ProjectAnalyticsSummary
}

export function AnalyticsOverviewCards({ summary }: AnalyticsOverviewCardsProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`
    }
    return num.toLocaleString()
  }

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`
  }

  const cards = [
    {
      title: 'Total de Posts',
      value: summary.totalPosts,
      subtitle: `${summary.postsWithAnalytics} com analytics`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Curtidas',
      value: summary.totalLikes,
      subtitle: 'Total acumulado',
      icon: Heart,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Comentários',
      value: summary.totalComments,
      subtitle: 'Total acumulado',
      icon: MessageCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Alcance',
      value: summary.totalReach,
      subtitle: 'Pessoas alcançadas',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Impressões',
      value: summary.totalImpressions,
      subtitle: 'Visualizações totais',
      icon: Eye,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Taxa de Engagement',
      value: summary.avgEngagementRate,
      subtitle: 'Média do período',
      icon: Share2,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      isPercent: true,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {card.isPercent
                  ? formatPercent(card.value)
                  : formatNumber(card.value)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
