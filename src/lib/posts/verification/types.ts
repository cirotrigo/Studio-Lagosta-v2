import { Project, SocialPost } from '../../../../prisma/generated/client'

export type VerificationErrorCode =
  | 'NO_TAG'
  | 'LEGACY_POST_NO_TAG'
  | 'NO_IG_ACCOUNT'
  | 'TTL_EXPIRED'
  | 'NOT_FOUND'
  | 'POST_FAILED'
  | 'API_ERROR'
  | 'TOKEN_ERROR'
  | 'PERMISSION_ERROR'
  | 'RATE_LIMITED'
  | 'AMBIGUOUS_MATCH'

export interface VerificationSummary {
  processed: number
  verified: number
  failed: number
  rescheduled: number
  skipped: number
}

export interface SocialPostWithProject extends SocialPost {
  Project: Pick<Project, 'instagramAccountId' | 'instagramUsername' | 'instagramUserId'>
}
