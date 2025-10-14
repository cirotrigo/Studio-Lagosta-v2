import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
  resolveAnalyticsPeriod,
  upsertOrganizationMemberAnalytics,
  listOrganizationMemberAnalytics,
  type AnalyticsPeriodKey,
} from '@/lib/organizations'

const DEFAULT_PERIOD: AnalyticsPeriodKey = '30d'

function parsePeriodParams(req: Request) {
  const searchParams = new URL(req.url).searchParams
  const periodParam = (searchParams.get('period') ?? DEFAULT_PERIOD) as AnalyticsPeriodKey
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  if (periodParam === 'custom' && (!startDate || !endDate)) {
    throw new Error('startDate e endDate são obrigatórios quando period=custom')
  }

  const range = resolveAnalyticsPeriod(periodParam, {
    start: startDate ?? undefined,
    end: endDate ?? undefined,
  })

  return {
    key: periodParam,
    range,
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params

  try {
    await requireOrganizationMembership(orgId, {
      permissions: ['org:credits:view'],
    })

    const { key, range } = parsePeriodParams(req)

    await upsertOrganizationMemberAnalytics(orgId, range)
    const analytics = await listOrganizationMemberAnalytics(orgId, range)

    const clerkIds = analytics.map((entry) => entry.memberClerkId)
    const users = clerkIds.length
      ? await db.user.findMany({
          where: { clerkId: { in: clerkIds } },
          select: { id: true, clerkId: true, name: true, email: true },
        })
      : []

    const userMap = new Map(users.map((user) => [user.clerkId, user]))

    const members = analytics.map((entry) => {
      const user = userMap.get(entry.memberClerkId)

      return {
        clerkId: entry.memberClerkId,
        userId: entry.memberUserId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        stats: {
          imageGenerations: entry.imageGenerationsCount,
          videoGenerations: entry.videoGenerationsCount,
          chatInteractions: entry.chatInteractionsCount,
          totalCreditsUsed: entry.totalCreditsUsed,
          lastActivityAt: entry.lastActivityAt ? entry.lastActivityAt.toISOString() : null,
        },
        period: {
          start: entry.periodStart.toISOString(),
          end: entry.periodEnd.toISOString(),
        },
        updatedAt: entry.updatedAt.toISOString(),
      }
    })

    const totals = members.reduce(
      (acc, member) => {
        acc.imageGenerations += member.stats.imageGenerations
        acc.videoGenerations += member.stats.videoGenerations
        acc.chatInteractions += member.stats.chatInteractions
        acc.totalCreditsUsed += member.stats.totalCreditsUsed
        return acc
      },
      {
        imageGenerations: 0,
        videoGenerations: 0,
        chatInteractions: 0,
        totalCreditsUsed: 0,
      },
    )

    return NextResponse.json({
      period: {
        key,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      totals,
      members,
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    if (error instanceof Error && error.message.includes('startDate')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('[Org Analytics] Failed to load member analytics', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar analytics por membro' },
      { status: 500 }
    )
  }
}
