import { db } from '@/lib/db'
import type { Prisma } from '../../../prisma/generated/client'

export type AnalyticsPeriodKey = '7d' | '30d' | '90d' | 'custom'

export type AnalyticsPeriodRange = {
  start: Date
  end: Date
}

export type MemberAnalyticsStats = {
  memberClerkId: string
  memberUserId: string | null
  imageGenerationsCount: number
  videoGenerationsCount: number
  chatInteractionsCount: number
  totalCreditsUsed: number
  lastActivityAt: Date | null
}

type OrganizationRecord = {
  id: string
  clerkOrgId: string
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function subtractDays(base: Date, amount: number) {
  const copy = new Date(base)
  copy.setDate(copy.getDate() - amount)
  return copy
}

export function resolveAnalyticsPeriod(
  key: AnalyticsPeriodKey,
  custom?: { start?: Date | string; end?: Date | string }
): AnalyticsPeriodRange {
  const now = new Date()
  const end = custom?.end ? endOfDay(new Date(custom.end)) : endOfDay(now)

  if (key === 'custom' && custom?.start) {
    return {
      start: startOfDay(new Date(custom.start)),
      end,
    }
  }

  const lookbackMap: Record<Exclude<AnalyticsPeriodKey, 'custom'>, number> = {
    '7d': 6,
    '30d': 29,
    '90d': 89,
  }

  const delta = lookbackMap[key] ?? 6
  const start = startOfDay(subtractDays(end, delta))

  return { start, end }
}

async function getOrganizationRecord(clerkOrgId: string): Promise<OrganizationRecord | null> {
  return db.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true, clerkOrgId: true },
  })
}

function normaliseFeature(feature: string) {
  return feature.trim().toLowerCase()
}

function countForFeature(
  accumulator: MemberAnalyticsStats,
  feature: string,
  entry: Prisma.OrganizationUsageGetPayload<{}>
) {
  const featureKey = normaliseFeature(feature)

  switch (featureKey) {
    case 'ai_image_generation':
    case 'image_generation':
      accumulator.imageGenerationsCount += 1
      break
    case 'video_export':
    case 'video_generation':
    case 'video_processing':
      accumulator.videoGenerationsCount += 1
      break
    case 'ai_text_chat':
    case 'chat_interaction':
      accumulator.chatInteractionsCount += 1
      break
    default:
      break
  }

  // Credits adjustments (negative) represent top-ups/refunds; the plan tracks only usage.
  if (entry.credits > 0) {
    accumulator.totalCreditsUsed += entry.credits
  }
}

export async function collectMemberUsageStats(
  organizationId: string,
  range: AnalyticsPeriodRange
): Promise<Map<string, MemberAnalyticsStats>> {
  const usageEntries = await db.organizationUsage.findMany({
    where: {
      organizationId,
      createdAt: {
        gte: range.start,
        lte: range.end,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const statsByMember = new Map<string, MemberAnalyticsStats>()

  for (const entry of usageEntries) {
    if (!entry.userId) continue
    const existing = statsByMember.get(entry.userId)
    const draft: MemberAnalyticsStats =
      existing ?? {
        memberClerkId: entry.userId,
        memberUserId: null,
        imageGenerationsCount: 0,
        videoGenerationsCount: 0,
        chatInteractionsCount: 0,
        totalCreditsUsed: 0,
        lastActivityAt: null,
      }

    countForFeature(draft, entry.feature, entry)

    if (!draft.lastActivityAt || entry.createdAt > draft.lastActivityAt) {
      draft.lastActivityAt = entry.createdAt
    }

    statsByMember.set(entry.userId, draft)
  }

  if (statsByMember.size === 0) {
    return statsByMember
  }

  const clerkIds = Array.from(statsByMember.keys())
  const users = await db.user.findMany({
    where: { clerkId: { in: clerkIds } },
    select: { id: true, clerkId: true },
  })

  const userIdMap = new Map(users.map((user) => [user.clerkId, user.id]))

  for (const [memberClerkId, value] of statsByMember.entries()) {
    value.memberUserId = userIdMap.get(memberClerkId) ?? null
    statsByMember.set(memberClerkId, value)
  }

  return statsByMember
}

export async function upsertOrganizationMemberAnalytics(
  clerkOrgId: string,
  range: AnalyticsPeriodRange
) {
  const organization = await getOrganizationRecord(clerkOrgId)
  if (!organization) {
    throw new Error(`Organização ${clerkOrgId} não encontrada`)
  }

  const statsMap = await collectMemberUsageStats(organization.id, range)

  const tasks = Array.from(statsMap.values()).map((stat) =>
    db.organizationMemberAnalytics.upsert({
      where: {
        organizationId_memberClerkId_periodStart: {
          organizationId: organization.id,
          memberClerkId: stat.memberClerkId,
          periodStart: range.start,
        },
      },
      update: {
        memberUserId: stat.memberUserId,
        imageGenerationsCount: stat.imageGenerationsCount,
        videoGenerationsCount: stat.videoGenerationsCount,
        chatInteractionsCount: stat.chatInteractionsCount,
        totalCreditsUsed: stat.totalCreditsUsed,
        lastActivityAt: stat.lastActivityAt,
        periodEnd: range.end,
      },
      create: {
        organizationId: organization.id,
        memberClerkId: stat.memberClerkId,
        memberUserId: stat.memberUserId,
        imageGenerationsCount: stat.imageGenerationsCount,
        videoGenerationsCount: stat.videoGenerationsCount,
        chatInteractionsCount: stat.chatInteractionsCount,
        totalCreditsUsed: stat.totalCreditsUsed,
        lastActivityAt: stat.lastActivityAt,
        periodStart: range.start,
        periodEnd: range.end,
      },
    })
  )

  await Promise.all(tasks)

  return statsMap
}

export async function listOrganizationMemberAnalytics(
  clerkOrgId: string,
  range: AnalyticsPeriodRange
) {
  const organization = await getOrganizationRecord(clerkOrgId)
  if (!organization) {
    throw new Error(`Organização ${clerkOrgId} não encontrada`)
  }

  return db.organizationMemberAnalytics.findMany({
    where: {
      organizationId: organization.id,
      periodStart: range.start,
    },
    orderBy: [{ totalCreditsUsed: 'desc' }, { imageGenerationsCount: 'desc' }],
  })
}
