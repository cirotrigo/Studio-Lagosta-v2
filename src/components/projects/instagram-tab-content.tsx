'use client'

import Image from 'next/image'
import { useInstagramDashboard } from '@/hooks/use-instagram-analytics'
import { WeeklySummaryCard } from '@/components/instagram/weekly-summary-card'
import { DailyHeatmap } from '@/components/instagram/daily-heatmap'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface InstagramTabContentProps {
  projectId: number
}

export function InstagramTabContent({ projectId }: InstagramTabContentProps) {
  const { data, isLoading, error } = useInstagramDashboard(projectId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Erro ao carregar dados do Instagram</p>
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
      <div>
        <h2 className="text-2xl font-bold">Instagram Analytics</h2>
        <p className="text-muted-foreground">@{data.username}</p>
      </div>

      {/* Resumo Semanal */}
      {data.currentWeek && (
        <WeeklySummaryCard
          username={data.username}
          feeds={{
            published: data.currentWeek.feedsPublished,
            goal: data.currentWeek.feedsGoal,
            completionRate: data.currentWeek.feedsCompletionRate,
          }}
          stories={{
            published: data.currentWeek.storiesPublished,
            goal: data.currentWeek.storiesGoal,
            completionRate: data.currentWeek.storiesCompletionRate,
          }}
          score={data.currentWeek.score}
          alerts={data.currentWeek.alerts}
        />
      )}

      {/* Heatmap de Stories Diárias */}
      <Card>
        <CardHeader>
          <CardTitle>Stories Diárias (Semana Atual)</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyHeatmap data={data.dailySummaries} />
        </CardContent>
      </Card>

      {/* Feeds Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Feeds Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.recentFeeds.map((feed) => (
              <a
                key={feed.id}
                href={feed.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                  <Image
                    src={feed.media_url}
                    alt={feed.caption || 'Feed post'}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                {feed.caption && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {feed.caption}
                  </p>
                )}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
