/**
 * Post Metrics Component
 * Displays analytics metrics for a published post
 */

import { Heart, MessageCircle, Eye, ExternalLink } from 'lucide-react'

interface PostMetricsProps {
  likes: number | null
  comments: number | null
  reach: number | null
  impressions: number | null
  engagement: number | null
  fetchedAt: string | null
  platformUrl?: string | null
}

export function PostMetrics({
  likes,
  comments,
  reach,
  impressions,
  engagement,
  fetchedAt,
  platformUrl
}: PostMetricsProps) {
  // If metrics not fetched yet
  if (!fetchedAt) {
    return (
      <div className="text-xs text-muted-foreground mt-2">
        📊 Métricas serão carregadas em breve...
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <Heart className="h-4 w-4 text-red-500" />
          <span className="font-medium">{likes?.toLocaleString() || 0}</span>
        </div>

        <div className="flex items-center gap-1">
          <MessageCircle className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{comments?.toLocaleString() || 0}</span>
        </div>

        {reach && (
          <div className="flex items-center gap-1">
            <Eye className="h-4 w-4 text-purple-500" />
            <span className="font-medium">{reach.toLocaleString()}</span>
          </div>
        )}
      </div>

      {impressions && (
        <div className="text-xs text-muted-foreground">
          {impressions.toLocaleString()} impressões
        </div>
      )}

      {platformUrl && (
        <a
          href={platformUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline flex items-center gap-1"
        >
          Ver no Instagram <ExternalLink className="h-3 w-3" />
        </a>
      )}

      <div className="text-xs text-muted-foreground">
        Atualizado {new Date(fetchedAt).toLocaleDateString()}
      </div>
    </div>
  )
}
