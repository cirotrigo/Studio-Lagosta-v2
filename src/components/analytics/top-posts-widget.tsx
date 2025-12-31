'use client'

import { PostAnalyticsItem } from '@/hooks/use-project-analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, TrendingUp } from 'lucide-react'

interface TopPostsWidgetProps {
  title: string
  posts: PostAnalyticsItem[]
  metric: 'engagement' | 'reach'
}

export function TopPostsWidget({ title, posts, metric }: TopPostsWidgetProps) {
  const formatNumber = (num: number | null) => {
    if (num === null) return '-'
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`
    }
    return num.toLocaleString()
  }

  const getMetricValue = (post: PostAnalyticsItem) => {
    if (metric === 'engagement') {
      return post.analyticsEngagement
    }
    return post.analyticsReach
  }

  const getMetricLabel = () => {
    return metric === 'engagement' ? 'Engagement' : 'Alcance'
  }

  if (posts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum post com analytics disponível
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {posts.map((post, index) => {
            const metricValue = getMetricValue(post)
            return (
              <div
                key={post.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm line-clamp-2 mb-1">{post.caption}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {post.postType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {getMetricLabel()}: {formatNumber(metricValue)}
                    </span>
                    {post.analyticsLikes && (
                      <span className="text-xs text-muted-foreground">
                        ❤️ {formatNumber(post.analyticsLikes)}
                      </span>
                    )}
                    {post.analyticsComments && (
                      <span className="text-xs text-muted-foreground">
                        💬 {formatNumber(post.analyticsComments)}
                      </span>
                    )}
                  </div>
                </div>
                {post.publishedUrl && (
                  <a
                    href={post.publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
