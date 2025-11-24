import { db } from '@/lib/db'
import { InstagramApiException, InstagramGraphApiClient, InstagramStory } from '@/lib/instagram/graph-api-client'
import { PostStatus, PostType, VerificationStatus } from '../../../../prisma/generated/client'
import { SocialPostWithProject, VerificationErrorCode, VerificationSummary } from './types'

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MINUTES = [5, 10, 15]
export const INITIAL_VERIFICATION_DELAY_MINUTES = RETRY_DELAYS_MINUTES[0]
const FALLBACK_WINDOW_MINUTES = 5
const STORY_TTL_HOURS = 24
const RATE_LIMIT_DELAY_MINUTES = 15
const DEFAULT_LAUNCH_DATE = '2024-12-01T00:00:00Z'

type VerificationTarget = {
  post: SocialPostWithProject
  igUserId: string
  baseTimestamp: Date
}

type MatchResult =
  | { type: 'tag'; story: InstagramStory }
  | { type: 'fallback'; story: InstagramStory }
  | { type: 'ambiguous' }
  | { type: 'none' }

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000)

const parseLaunchDate = (): Date => {
  const raw = process.env.VERIFICATION_FEATURE_LAUNCH_DATE
  const parsed = raw ? new Date(raw) : new Date(DEFAULT_LAUNCH_DATE)
  if (Number.isNaN(parsed.getTime())) {
    return new Date(DEFAULT_LAUNCH_DATE)
  }
  return parsed
}

const launchDate = parseLaunchDate()

const isVideoUrl = (url: string) => {
  const lower = url.toLowerCase()
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.avi') || lower.includes('video') || lower.includes('.webm')
}

const detectMediaType = (urls: string[]): 'image' | 'video' | null => {
  if (urls.length === 0) return null
  return urls.some(isVideoUrl) ? 'video' : 'image'
}

export class StoryVerifier {
  private client = new InstagramGraphApiClient()

  async processPendingVerifications(): Promise<VerificationSummary> {
    const now = new Date()

    const posts = await db.socialPost.findMany({
      where: {
        verificationStatus: VerificationStatus.PENDING,
        nextVerificationAt: { lte: now },
        postType: PostType.STORY,
        status: PostStatus.POSTED,
      },
      include: {
        Project: {
          select: {
            instagramAccountId: true,
            instagramUsername: true,
            instagramUserId: true,
          },
        },
      },
      orderBy: {
        nextVerificationAt: 'asc',
      },
    })

    const summary: VerificationSummary = {
      processed: posts.length,
      verified: 0,
      failed: 0,
      rescheduled: 0,
      skipped: 0,
    }

    if (posts.length === 0) {
      return summary
    }

    const targets: VerificationTarget[] = []

    for (const post of posts) {
      const baseTimestamp = this.getBaseTimestamp(post)

      if (this.isStoryExpired(baseTimestamp)) {
        await this.markFailure(post, 'TTL_EXPIRED', now)
        summary.failed++
        continue
      }

      if (!post.verificationTag) {
        if (this.isLegacyPost(post)) {
          await this.markSkipped(post, 'LEGACY_POST_NO_TAG', now)
          summary.skipped++
        } else {
          await this.markFailure(post, 'NO_TAG', now)
          summary.failed++
        }
        continue
      }

      const igUserId = post.Project.instagramUserId || post.Project.instagramAccountId
      if (!igUserId) {
        await this.markFailure(post, 'NO_IG_ACCOUNT', now)
        summary.failed++
        continue
      }

      targets.push({ post, igUserId, baseTimestamp })
    }

    const grouped = targets.reduce<Map<string, VerificationTarget[]>>((acc, target) => {
      const list = acc.get(target.igUserId) || []
      list.push(target)
      acc.set(target.igUserId, list)
      return acc
    }, new Map())

    for (const [igUserId, accountTargets] of grouped.entries()) {
      let stories: InstagramStory[] = []

      try {
        stories = await this.client.getStories(igUserId)
      } catch (error) {
        if (error instanceof InstagramApiException) {
          if (error.isTokenError) {
            await Promise.all(
              accountTargets.map((target) => this.markFailure(target.post, 'TOKEN_ERROR', now, { preserveAttempts: true }))
            )
            summary.failed += accountTargets.length
            continue
          }

          if (error.isPermissionError) {
            await Promise.all(
              accountTargets.map((target) => this.markFailure(target.post, 'PERMISSION_ERROR', now, { preserveAttempts: true }))
            )
            summary.failed += accountTargets.length
            continue
          }

          if (error.isRateLimited) {
            await Promise.all(
              accountTargets.map((target) =>
                this.reschedule(target.post, target.baseTimestamp, target.post.verificationAttempts, RATE_LIMIT_DELAY_MINUTES, 'RATE_LIMITED', now)
              )
            )
            summary.rescheduled += accountTargets.length
            continue
          }

          for (const target of accountTargets) {
            const attempt = target.post.verificationAttempts + 1
            if (attempt >= MAX_ATTEMPTS) {
              await this.markFailure(target.post, 'API_ERROR', now, { attempts: attempt })
              summary.failed++
            } else {
              await this.reschedule(
                target.post,
                target.baseTimestamp,
                attempt,
                this.getNextDelayMinutes(attempt),
                'API_ERROR',
                now
              )
              summary.rescheduled++
            }
          }
          continue
        }

        console.error('[Verification] Unexpected error fetching stories:', error)
        for (const target of accountTargets) {
          const attempt = target.post.verificationAttempts + 1
          if (attempt >= MAX_ATTEMPTS) {
            await this.markFailure(target.post, 'API_ERROR', now, { attempts: attempt })
            summary.failed++
          } else {
            await this.reschedule(
              target.post,
              target.baseTimestamp,
              attempt,
              this.getNextDelayMinutes(attempt),
              'API_ERROR',
              now
            )
            summary.rescheduled++
          }
        }
        continue
      }

      for (const target of accountTargets) {
        const attempt = target.post.verificationAttempts + 1
        const match = this.findMatchingStory(target.post, stories, target.baseTimestamp)

        if (match.type === 'tag' || match.type === 'fallback') {
          await this.markVerified(target.post, match.story, now, {
            verifiedByFallback: match.type === 'fallback',
            attempts: attempt,
          })
          summary.verified++
          continue
        }

        if (match.type === 'ambiguous') {
          const hasAttemptsLeft = attempt < MAX_ATTEMPTS
          if (hasAttemptsLeft) {
            await this.reschedule(
              target.post,
              target.baseTimestamp,
              attempt,
              this.getNextDelayMinutes(attempt),
              'AMBIGUOUS_MATCH',
              now
            )
            summary.rescheduled++
          } else {
            await this.markFailure(target.post, 'AMBIGUOUS_MATCH', now, { attempts: attempt })
            summary.failed++
          }
          continue
        }

        // No match found
        if (this.isStoryExpired(target.baseTimestamp) || attempt >= MAX_ATTEMPTS) {
          await this.markFailure(target.post, 'NOT_FOUND', now, { attempts: attempt })
          summary.failed++
          continue
        }

        await this.reschedule(
          target.post,
          target.baseTimestamp,
          attempt,
          this.getNextDelayMinutes(attempt),
          'NOT_FOUND',
          now
        )
        summary.rescheduled++
      }
    }

    return summary
  }

  private findMatchingStory(post: SocialPostWithProject, stories: InstagramStory[], baseTimestamp: Date): MatchResult {
    const tag = post.verificationTag
    if (tag) {
      const tagMatch = stories.find((story) => story.caption?.includes(tag))
      if (tagMatch) {
        return { type: 'tag', story: tagMatch }
      }
    }

    const expectedMediaType = detectMediaType(post.mediaUrls)
    const candidates = stories.filter((story) => {
      if (!story.timestamp) return false
      const storyTimestamp = new Date(story.timestamp)
      const diffMinutes = Math.abs(storyTimestamp.getTime() - baseTimestamp.getTime()) / (60 * 1000)
      if (diffMinutes > FALLBACK_WINDOW_MINUTES) return false

      if (!expectedMediaType || !story.media_type) return true
      return story.media_type.toLowerCase() === expectedMediaType
    })

    if (candidates.length === 1) {
      return { type: 'fallback', story: candidates[0] }
    }

    if (candidates.length > 1) {
      return { type: 'ambiguous' }
    }

    return { type: 'none' }
  }

  private async markVerified(
    post: SocialPostWithProject,
    story: InstagramStory,
    now: Date,
    options: { verifiedByFallback: boolean; attempts: number }
  ) {
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        verificationAttempts: options.attempts,
        verifiedByFallback: options.verifiedByFallback,
        verifiedStoryId: story.id,
        verifiedPermalink: story.permalink,
        verifiedTimestamp: story.timestamp ? new Date(story.timestamp) : null,
        lastVerificationAt: now,
        nextVerificationAt: null,
        verificationError: null,
      },
    })

    console.log('[Verification] Post verified', {
      postId: post.id,
      projectId: post.projectId,
      verifiedByFallback: options.verifiedByFallback,
      storyId: story.id,
    })
  }

  private async markFailure(
    post: SocialPostWithProject,
    error: VerificationErrorCode,
    now: Date,
    options?: { attempts?: number; preserveAttempts?: boolean }
  ) {
    const attempts = options?.preserveAttempts ? post.verificationAttempts : options?.attempts ?? post.verificationAttempts + 1

    await db.socialPost.update({
      where: { id: post.id },
      data: {
        verificationStatus: VerificationStatus.VERIFICATION_FAILED,
        verificationAttempts: attempts,
        lastVerificationAt: now,
        nextVerificationAt: null,
        verificationError: error,
      },
    })

    console.warn('[Verification] Post marked as failed', {
      postId: post.id,
      error,
    })
  }

  private async markSkipped(post: SocialPostWithProject, error: VerificationErrorCode, now: Date) {
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        verificationStatus: VerificationStatus.SKIPPED,
        lastVerificationAt: now,
        nextVerificationAt: null,
        verificationError: error,
      },
    })
  }

  private async reschedule(
    post: SocialPostWithProject,
    baseTimestamp: Date,
    attempts: number,
    delayMinutes: number,
    error: VerificationErrorCode,
    now: Date
  ) {
    const isExpired = this.isStoryExpired(baseTimestamp)
    if (isExpired) {
      await this.markFailure(post, 'TTL_EXPIRED', now, { attempts })
      return
    }

    await db.socialPost.update({
      where: { id: post.id },
      data: {
        verificationStatus: VerificationStatus.PENDING,
        verificationAttempts: attempts,
        nextVerificationAt: addMinutes(now, delayMinutes),
        lastVerificationAt: now,
        verificationError: error,
      },
    })
  }

  private getNextDelayMinutes(attempt: number): number {
    const index = Math.min(attempt, RETRY_DELAYS_MINUTES.length) - 1
    return RETRY_DELAYS_MINUTES[index] ?? RETRY_DELAYS_MINUTES[RETRY_DELAYS_MINUTES.length - 1]
  }

  private getBaseTimestamp(post: SocialPostWithProject): Date {
    return post.sentAt || post.bufferSentAt || post.scheduledDatetime || post.createdAt
  }

  private isStoryExpired(baseTimestamp: Date): boolean {
    const ttlMs = STORY_TTL_HOURS * 60 * 60 * 1000
    return Date.now() - baseTimestamp.getTime() > ttlMs
  }

  private isLegacyPost(post: SocialPostWithProject): boolean {
    return post.createdAt < launchDate
  }
}
