import { AlertType, AlertSeverity, Alert } from './types'

interface WeeklyMetrics {
  feeds: {
    published: number
    goal: number
    completionRate: number
    missing: number
  }
  stories: {
    published: number
    goal: number
    completionRate: number
    missing: number
    dailyBreakdown: Array<{
      date: string
      count: number
      goal: number
      completed: boolean
    }>
  }
  overall: {
    daysWithoutPost: number
    completionRate: number
  }
}

export function generateAlerts(metrics: WeeklyMetrics): Alert[] {
  const alerts: Alert[] = []

  // Alerta: Feeds abaixo da meta
  if (metrics.feeds.completionRate < 100) {
    alerts.push({
      type: AlertType.BELOW_GOAL,
      category: 'feeds',
      message: `Faltam ${metrics.feeds.missing} ${
        metrics.feeds.missing === 1 ? 'feed' : 'feeds'
      } nesta semana`,
      severity:
        metrics.feeds.completionRate < 50
          ? AlertSeverity.CRITICAL
          : metrics.feeds.completionRate < 75
          ? AlertSeverity.WARNING
          : AlertSeverity.INFO,
    })
  }

  // Alerta: Stories abaixo da meta
  if (metrics.stories.completionRate < 100) {
    const daysNotMet = metrics.stories.dailyBreakdown.filter(
      (d) => !d.completed
    ).length

    alerts.push({
      type: AlertType.BELOW_GOAL,
      category: 'stories',
      message: `Meta de stories não atingida em ${daysNotMet} ${
        daysNotMet === 1 ? 'dia' : 'dias'
      }`,
      severity: daysNotMet >= 4 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
    })
  }

  // Alerta: Dias sem nenhuma postagem
  if (metrics.overall.daysWithoutPost > 0) {
    alerts.push({
      type: AlertType.NO_POST,
      category: 'general',
      message: `${metrics.overall.daysWithoutPost} ${
        metrics.overall.daysWithoutPost === 1 ? 'dia' : 'dias'
      } sem nenhuma postagem`,
      severity: AlertSeverity.CRITICAL,
    })
  }

  return alerts
}
