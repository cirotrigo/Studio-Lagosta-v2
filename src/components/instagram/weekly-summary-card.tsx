'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'

interface WeeklySummaryCardProps {
  username: string
  feeds: {
    published: number
    goal: number
    completionRate: number
  }
  stories: {
    published: number
    goal: number
    completionRate: number
  }
  score: string
  alerts?: Array<{
    type: string
    message: string
    severity: string
  }>
}

export function WeeklySummaryCard({
  username,
  feeds,
  stories,
  score,
  alerts = [],
}: WeeklySummaryCardProps) {
  const getScoreColor = (score: string) => {
    switch (score) {
      case 'A':
        return 'bg-green-500'
      case 'B':
        return 'bg-blue-500'
      case 'C':
        return 'bg-yellow-500'
      case 'D':
        return 'bg-orange-500'
      case 'F':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatus = (completionRate: number) => {
    if (completionRate >= 90) return { color: 'success', icon: TrendingUp }
    if (completionRate >= 70) return { color: 'warning', icon: TrendingDown }
    return { color: 'danger', icon: AlertCircle }
  }

  const overallRate = (feeds.completionRate + stories.completionRate) / 2
  const status = getStatus(overallRate)
  const StatusIcon = status.icon

  return (
    <Card className={`border-l-4 border-l-${getScoreColor(score)}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">@{username}</h3>
            <StatusIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <Badge className={getScoreColor(score)}>
            Score: {score}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <MetricRow
          label="Feeds (semana)"
          current={feeds.published}
          goal={feeds.goal}
          progress={feeds.completionRate}
        />

        <MetricRow
          label="Stories (semana)"
          current={stories.published}
          goal={stories.goal}
          progress={stories.completionRate}
        />

        {alerts.length > 0 && (
          <div className="mt-4 space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-2 rounded text-sm ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MetricRow({
  label,
  current,
  goal,
  progress,
}: {
  label: string
  current: number
  goal: number
  progress: number
}) {
  const percentage = Math.min(100, progress)
  const isComplete = current >= goal

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${isComplete ? 'text-green-600' : 'text-gray-900'}`}>
          {current}/{goal}
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${
          percentage >= 100 ? '[&>div]:bg-green-500' :
          percentage >= 75 ? '[&>div]:bg-yellow-500' :
          '[&>div]:bg-red-500'
        }`}
      />
    </div>
  )
}
