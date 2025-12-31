/**
 * Month Overview Component
 * Displays aggregated analytics for the month
 */

interface MonthOverviewProps {
  overview: {
    totalPosts: number
    totalLikes: number
    totalComments: number
    totalEngagement: number
    avgEngagement: number
    hasAnalytics: boolean
  }
}

export function MonthOverview({ overview }: MonthOverviewProps) {
  if (!overview.hasAnalytics) {
    return (
      <div className="bg-muted/50 rounded-lg p-4 mb-4">
        <p className="text-sm text-muted-foreground">
          📊 Analytics estão sendo carregados. Aguarde alguns minutos...
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-card rounded-lg p-4 border">
        <div className="text-sm text-muted-foreground">Total de Posts</div>
        <div className="text-2xl font-bold">{overview.totalPosts}</div>
      </div>

      <div className="bg-card rounded-lg p-4 border">
        <div className="text-sm text-muted-foreground">Total de Curtidas</div>
        <div className="text-2xl font-bold text-red-500">
          {overview.totalLikes.toLocaleString()}
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border">
        <div className="text-sm text-muted-foreground">Total de Comentários</div>
        <div className="text-2xl font-bold text-blue-500">
          {overview.totalComments.toLocaleString()}
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border">
        <div className="text-sm text-muted-foreground">Engajamento Médio</div>
        <div className="text-2xl font-bold text-purple-500">
          {overview.avgEngagement.toLocaleString()}
        </div>
      </div>
    </div>
  )
}
