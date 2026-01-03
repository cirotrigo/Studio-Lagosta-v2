import { db } from '@/lib/db'
import { InstagramApiException, InstagramGraphApiClient, InstagramStory } from '@/lib/instagram/graph-api-client'
import { PostType, PublishType, VerificationStatus } from '../../../../prisma/generated/client'
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
        // Verifica TODOS os posts (POSTED e FAILED) pois webhook do Buffer não é confiável
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

      if (this.shouldVerifyFromLate(post)) {
        await this.markVerifiedFromLate(post, now)
        summary.verified++
        continue
      }

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

      // Tentar matching em lote para resolver ambiguidade
      const batchResult = await this.batchMatchStories(accountTargets, stories, now)

      summary.verified += batchResult.verified
      summary.failed += batchResult.failed
      summary.rescheduled += batchResult.rescheduled
    }

    return summary
  }

  /**
   * Faz matching em lote para resolver ambiguidade quando múltiplos posts foram agendados no mesmo horário.
   * Estratégia: ordena posts e stories por timestamp e faz match 1:1 por posição.
   */
  private async batchMatchStories(
    targets: VerificationTarget[],
    stories: InstagramStory[],
    now: Date
  ): Promise<{ verified: number; failed: number; rescheduled: number }> {
    const result = { verified: 0, failed: 0, rescheduled: 0 }

    // Tentar match por TAG primeiro (pode resolver alguns casos)
    const remainingTargets: VerificationTarget[] = []

    for (const target of targets) {
      const attempt = target.post.verificationAttempts + 1
      const tag = target.post.verificationTag

      if (tag) {
        const tagMatch = stories.find((story) => story.caption?.includes(tag))
        if (tagMatch) {
          await this.markVerified(target.post, tagMatch, now, {
            verifiedByFallback: false,
            attempts: attempt,
          })
          result.verified++
          continue
        }
      }

      remainingTargets.push(target)
    }

    if (remainingTargets.length === 0) {
      return result
    }

    // Agrupar posts restantes por janela de tempo (±5 min)
    const timeGroups = this.groupByTimeWindow(remainingTargets)

    for (const group of timeGroups) {
      const groupResult = await this.matchTimeGroup(group, stories, now)
      result.verified += groupResult.verified
      result.failed += groupResult.failed
      result.rescheduled += groupResult.rescheduled
    }

    return result
  }

  /**
   * Agrupa posts por janela de tempo (±5 min) para fazer matching em lote
   */
  private groupByTimeWindow(targets: VerificationTarget[]): VerificationTarget[][] {
    if (targets.length === 0) return []

    // Ordenar por timestamp
    const sorted = [...targets].sort((a, b) => a.baseTimestamp.getTime() - b.baseTimestamp.getTime())

    const groups: VerificationTarget[][] = []
    let currentGroup: VerificationTarget[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const previous = sorted[i - 1]
      const diffMinutes = Math.abs(current.baseTimestamp.getTime() - previous.baseTimestamp.getTime()) / (60 * 1000)

      if (diffMinutes <= FALLBACK_WINDOW_MINUTES * 2) {
        // Dentro da mesma janela (considerando margem dupla)
        currentGroup.push(current)
      } else {
        // Nova janela
        groups.push(currentGroup)
        currentGroup = [current]
      }
    }

    groups.push(currentGroup)
    return groups
  }

  /**
   * Faz matching para um grupo de posts no mesmo intervalo de tempo
   */
  private async matchTimeGroup(
    group: VerificationTarget[],
    stories: InstagramStory[],
    now: Date
  ): Promise<{ verified: number; failed: number; rescheduled: number }> {
    const result = { verified: 0, failed: 0, rescheduled: 0 }

    // Se for apenas 1 post, usar lógica individual
    if (group.length === 1) {
      const target = group[0]
      const attempt = target.post.verificationAttempts + 1
      const match = this.findMatchingStory(target.post, stories, target.baseTimestamp)

      if (match.type === 'fallback') {
        await this.markVerified(target.post, match.story, now, {
          verifiedByFallback: true,
          attempts: attempt,
        })
        result.verified++
        return result
      }

      if (match.type === 'none') {
        if (this.isStoryExpired(target.baseTimestamp) || attempt >= MAX_ATTEMPTS) {
          await this.markFailure(target.post, 'NOT_FOUND', now, { attempts: attempt })
          result.failed++
        } else {
          await this.reschedule(
            target.post,
            target.baseTimestamp,
            attempt,
            this.getNextDelayMinutes(attempt),
            'NOT_FOUND',
            now
          )
          result.rescheduled++
        }
        return result
      }

      // ambiguous - deixa para tentar em lote
    }

    // Múltiplos posts: buscar candidatos para TODOS os posts do grupo
    const allCandidates: InstagramStory[] = []
    const candidateSet = new Set<string>()

    for (const target of group) {
      const expectedMediaType = detectMediaType(target.post.mediaUrls)
      const candidates = stories.filter((story) => {
        if (!story.timestamp) return false
        const storyTimestamp = new Date(story.timestamp)
        const diffMinutes = Math.abs(storyTimestamp.getTime() - target.baseTimestamp.getTime()) / (60 * 1000)
        if (diffMinutes > FALLBACK_WINDOW_MINUTES) return false

        if (!expectedMediaType || !story.media_type) return true
        return story.media_type.toLowerCase() === expectedMediaType
      })

      for (const candidate of candidates) {
        if (!candidateSet.has(candidate.id)) {
          candidateSet.add(candidate.id)
          allCandidates.push(candidate)
        }
      }
    }

    console.log(`[Verification] Time group: ${group.length} posts, ${allCandidates.length} story candidates`)

    // Se não houver candidatos suficientes
    if (allCandidates.length === 0) {
      for (const target of group) {
        const attempt = target.post.verificationAttempts + 1
        if (this.isStoryExpired(target.baseTimestamp) || attempt >= MAX_ATTEMPTS) {
          await this.markFailure(target.post, 'NOT_FOUND', now, { attempts: attempt })
          result.failed++
        } else {
          await this.reschedule(
            target.post,
            target.baseTimestamp,
            attempt,
            this.getNextDelayMinutes(attempt),
            'NOT_FOUND',
            now
          )
          result.rescheduled++
        }
      }
      return result
    }

    // Ordenar posts por createdAt (ordem de criação no sistema)
    const sortedPosts = [...group].sort((a, b) => a.post.createdAt.getTime() - b.post.createdAt.getTime())

    // Ordenar stories por timestamp (ordem de publicação no Instagram)
    const sortedStories = [...allCandidates].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return timeA - timeB
    })

    console.log('[Verification] Ordered matching:')
    sortedPosts.forEach((target, i) => {
      console.log(`  Post ${i + 1}: ${target.post.id} (created: ${target.post.createdAt.toISOString()})`)
    })
    sortedStories.forEach((story, i) => {
      console.log(`  Story ${i + 1}: ${story.id} (published: ${story.timestamp})`)
    })

    // Fazer match 1:1 por posição
    const matchCount = Math.min(sortedPosts.length, sortedStories.length)

    for (let i = 0; i < matchCount; i++) {
      const target = sortedPosts[i]
      const story = sortedStories[i]
      const attempt = target.post.verificationAttempts + 1

      console.log(`[Verification] Matching post ${target.post.id} → story ${story.id} (position ${i + 1})`)

      await this.markVerified(target.post, story, now, {
        verifiedByFallback: true,
        attempts: attempt,
      })
      result.verified++
    }

    // Posts que sobraram (mais posts que stories)
    for (let i = matchCount; i < sortedPosts.length; i++) {
      const target = sortedPosts[i]
      const attempt = target.post.verificationAttempts + 1

      console.log(`[Verification] Post ${target.post.id} - no story found (position ${i + 1})`)

      if (this.isStoryExpired(target.baseTimestamp) || attempt >= MAX_ATTEMPTS) {
        await this.markFailure(target.post, 'NOT_FOUND', now, { attempts: attempt })
        result.failed++
      } else {
        await this.reschedule(
          target.post,
          target.baseTimestamp,
          attempt,
          this.getNextDelayMinutes(attempt),
          'NOT_FOUND',
          now
        )
        result.rescheduled++
      }
    }

    return result
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

  private shouldVerifyFromLate(post: SocialPostWithProject): boolean {
    if (post.postType !== PostType.STORY) return false
    if (post.publishType !== PublishType.DIRECT) return false
    return post.lateStatus === 'published'
  }

  private async markVerifiedFromLate(post: SocialPostWithProject, now: Date) {
    const publishedAt = post.latePublishedAt || post.sentAt || now
    const platformUrl = post.publishedUrl || post.latePlatformUrl || null
    const platformPostId = post.instagramMediaId || null
    const attempts = Math.max(post.verificationAttempts || 0, 1)

    await db.socialPost.update({
      where: { id: post.id },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        verificationAttempts: attempts,
        verifiedByFallback: true,
        verifiedStoryId: platformPostId,
        verifiedPermalink: platformUrl,
        verifiedTimestamp: publishedAt,
        lastVerificationAt: now,
        nextVerificationAt: null,
        verificationError: null,
      },
    })

    console.log('[Verification] Post verified via Late', {
      postId: post.id,
      projectId: post.projectId,
      storyId: platformPostId,
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
