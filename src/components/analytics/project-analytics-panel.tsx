'use client'

import { useProjectAnalytics } from '@/hooks/use-project-analytics'
import { AnalyticsOverviewCards } from '@/components/analytics/analytics-overview-cards'
import { PostPerformanceTable } from '@/components/analytics/post-performance-table'
import { TopPostsWidget } from '@/components/analytics/top-posts-widget'
import { EngagementAlerts } from '@/components/analytics/engagement-alerts'
import { AnalyticsExport } from '@/components/analytics/analytics-export'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

interface ProjectAnalyticsPanelProps {
  projectId: number
  projectName?: string
  /** Cabeçalho com título e exportação — dispensável dentro da aba */
  showHeader?: boolean
}

/**
 * Conteúdo de métricas de um projeto, compartilhado entre a página
 * /projects/[id]/analytics e a aba Métricas.
 */
export function ProjectAnalyticsPanel({
  projectId,
  projectName,
  showHeader = true,
}: ProjectAnalyticsPanelProps) {
  const { data, isLoading, error } = useProjectAnalytics(projectId, {
    limit: 50,
    sortBy: 'engagement',
    order: 'desc',
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Alert className="border-destructive/20 bg-destructive/10">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <AlertTitle>Não foi possível carregar as métricas</AlertTitle>
        <AlertDescription>Tente recarregar a página em alguns instantes.</AlertDescription>
      </Alert>
    )
  }

  const semDados = data.summary.postsWithAnalytics === 0

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Métricas</h2>
            <p className="text-sm text-muted-foreground">
              Performance dos posts publicados
            </p>
          </div>
          <AnalyticsExport data={data} projectName={projectName} />
        </div>
      )}

      {semDados && (
        <Alert className="border-amber-500/20 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">
            Ainda sem métricas coletadas
          </AlertTitle>
          <AlertDescription className="text-amber-600 dark:text-amber-300">
            As métricas são coletadas automaticamente a cada hora, mas só para publicações feitas
            depois que o token do Instagram foi cadastrado — insights de story expiram em 24h e não
            são recuperáveis depois. Configure o token na aba <strong>Configurações</strong>.
          </AlertDescription>
        </Alert>
      )}

      <AnalyticsOverviewCards summary={data.summary} />

      {!semDados && (
        <>
          <EngagementAlerts summary={data.summary} posts={data.posts} />

          <div className="grid gap-6 md:grid-cols-2">
            <TopPostsWidget
              title="Top Posts por Engajamento"
              posts={data.topPerformers.byEngagement}
              metric="engagement"
            />
            <TopPostsWidget
              title="Top Posts por Alcance"
              posts={data.topPerformers.byReach}
              metric="reach"
            />
          </div>
        </>
      )}

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
