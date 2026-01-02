'use client'

import { useState } from 'react'
import { useProjectAnalytics } from '@/hooks/use-project-analytics'
import { useStoriesAnalytics } from '@/hooks/use-stories-analytics'
import { AnalyticsOverviewCards } from '@/components/analytics/analytics-overview-cards'
import { PostPerformanceTable } from '@/components/analytics/post-performance-table'
import { TopPostsWidget } from '@/components/analytics/top-posts-widget'
import { EngagementAlerts } from '@/components/analytics/engagement-alerts'
import { AnalyticsExport } from '@/components/analytics/analytics-export'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Calendar, Image as ImageIcon, Video } from 'lucide-react'

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

  const {
    data: storiesData,
    isLoading: storiesLoading,
    error: storiesError
  } = useStoriesAnalytics(projectId, {
    days: 30,
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
      <EngagementAlerts summary={data.summary} posts={data.posts.filter(post => post.postType !== 'STORY')} />

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

      {/* All Posts - With Tabs for Posts and Stories */}
      <Card>
        <CardHeader>
          <CardTitle>Todos os Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="posts" className="w-full">
            <TabsList>
              <TabsTrigger value="posts">
                <ImageIcon className="mr-2 h-4 w-4" />
                Posts
              </TabsTrigger>
              <TabsTrigger value="stories">
                <Video className="mr-2 h-4 w-4" />
                Stories
              </TabsTrigger>
            </TabsList>

            {/* Posts Tab */}
            <TabsContent value="posts" className="mt-4">
              <PostPerformanceTable posts={data.posts.filter(post => post.postType !== 'STORY')} />
            </TabsContent>

            {/* Stories Tab */}
            <TabsContent value="stories" className="mt-4">
              {storiesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-96 w-full" />
                </div>
              ) : storiesError || !storiesData ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
                  <Video className="h-16 w-16 mx-auto mb-4 text-blue-600" />
                  <p className="text-blue-900 font-medium text-lg mb-2">Analytics de Stories em Desenvolvimento</p>
                  <p className="text-blue-700 text-sm max-w-md mx-auto">
                    Estamos trabalhando para trazer analytics detalhados dos seus Stories do Instagram.
                    Em breve você poderá visualizar impressões, alcance e engajamento de todos os seus Stories publicados.
                  </p>
                </div>
              ) : storiesData && storiesData.stories.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {storiesData.stories.map((story) => (
                    <Card key={story.id} className="overflow-hidden">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium line-clamp-2">
                              {story.caption || 'Sem legenda'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(story.sentAt).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Impressões</p>
                            <p className="font-semibold">
                              {story.analytics.impressions?.toLocaleString('pt-BR') || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Alcance</p>
                            <p className="font-semibold">
                              {story.analytics.reach?.toLocaleString('pt-BR') || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Respostas</p>
                            <p className="font-semibold">
                              {story.analytics.replies?.toLocaleString('pt-BR') || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Engajamento</p>
                            <p className="font-semibold">
                              {story.analytics.engagementRate.toFixed(2)}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-gray-700 font-medium">Nenhum story com analytics disponível</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Stories precisam ser verificados pelo sistema para exibir analytics
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
