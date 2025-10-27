'use client'

import { InstagramSummary } from '@/hooks/use-instagram-analytics'
import { AlertCircle } from 'lucide-react'

interface InstagramMiniWidgetProps {
  summary: InstagramSummary
}

export function InstagramMiniWidget({ summary }: InstagramMiniWidgetProps) {
  const getScoreColor = (score: string) => {
    switch (score) {
      case 'A':
        return 'bg-green-500 text-white'
      case 'B':
        return 'bg-blue-500 text-white'
      case 'C':
        return 'bg-yellow-500 text-white'
      case 'D':
        return 'bg-orange-500 text-white'
      case 'F':
        return 'bg-red-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const getScoreEmoji = (score: string) => {
    switch (score) {
      case 'A':
        return '🟢'
      case 'B':
        return '🟡'
      case 'C':
        return '🟠'
      case 'D':
      case 'F':
        return '🔴'
      default:
        return '⚪'
    }
  }

  const feedsPercentage = Math.min(100, summary.feedsCompletionRate)
  const storiesPercentage = Math.min(100, summary.storiesCompletionRate)

  const criticalAlerts = summary.alerts.filter(a => a.severity === 'critical')
  const hasAlerts = criticalAlerts.length > 0

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            @{summary.username}
          </span>
          <span className="text-xs">{getScoreEmoji(summary.score)}</span>
        </div>
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getScoreColor(summary.score)}`}>
          {summary.score}
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-1.5">
        {/* Feeds */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className="text-muted-foreground">Feeds</span>
            <span className="font-medium text-foreground">
              {summary.feedsPublished}/{summary.feedsGoal}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                feedsPercentage >= 100
                  ? 'bg-green-500'
                  : feedsPercentage >= 75
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${feedsPercentage}%` }}
            />
          </div>
        </div>

        {/* Stories */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className="text-muted-foreground">Stories</span>
            <span className="font-medium text-foreground">
              {summary.storiesPublished}/{summary.storiesGoal}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                storiesPercentage >= 100
                  ? 'bg-green-500'
                  : storiesPercentage >= 75
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${storiesPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="mt-2 space-y-0.5">
          {criticalAlerts.slice(0, 2).map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-1 text-[10px] text-red-600 dark:text-red-400"
            >
              <AlertCircle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-1">{alert.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
