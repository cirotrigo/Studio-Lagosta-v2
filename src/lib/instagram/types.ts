export enum AlertType {
  BELOW_GOAL = 'below_goal',
  NO_POST = 'no_post',
  LOW_ENGAGEMENT = 'low_engagement',
  MISSING_STORIES = 'missing_stories',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export interface Alert {
  type: AlertType
  category: 'feeds' | 'stories' | 'general'
  message: string
  severity: AlertSeverity
}
