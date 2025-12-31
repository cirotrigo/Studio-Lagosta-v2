'use client'

import { useState } from 'react'
import { useProjectAnalytics } from '@/hooks/use-project-analytics'
import { AnalyticsOverviewCards } from '@/components/analytics/analytics-overview-cards'
import { PostPerformanceTable } from '@/components/analytics/post-performance-table'
import { TopPostsWidget } from '@/components/analytics/top-posts-widget'
import { EngagementAlerts } from '@/components/analytics/engagement-alerts'
import { AnalyticsExport } from '@/components/analytics/analytics-export'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'

interface AnalyticsTabContentProps {
  projectId: number
  projectName?: string
}

export function AnalyticsTabContent({ projectId, projectName }: AnalyticsTabContentProps) {
  const [dateRange, setDateRange] = useState<{
    fromDate?: string
    toDate?: string
  }>({})

  const { data, isLoading, error } = useProjectAnalytics(projectId, {
    ...dateRange,
    limit: 50,
    sortBy: 'engagement',
    order: 'desc',
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Erro ao carregar analytics</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-700">Nenhum dado disponível</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Later Analytics</h2>
          <p className="text-muted-foreground">
            Performance dos posts publicados via Later
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="mr-2 h-4 w-4" />
            Período
          </Button>
          <AnalyticsExport data={data} projectName={projectName} />
        </div>
      </div>

      {/* Overview Cards */}
      <AnalyticsOverviewCards summary={data.summary} />

      {/* Engagement Alerts */}
      <EngagementAlerts summary={data.summary} posts={data.posts} />

      {/* Top Performers */}
      <div className="grid gap-6 md:grid-cols-2">
        <TopPostsWidget
          title="Top Posts por Engagement"
          posts={data.topPerformers.byEngagement}
          metric="engagement"
        />
        <TopPostsWidget
          title="Top Posts por Alcance"
          posts={data.topPerformers.byReach}
          metric="reach"
        />
      </div>

      {/* All Posts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Todos os Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <PostPerformanceTable posts={data.posts} />
        </CardContent>
      </Card>
    </div>
  )
}
