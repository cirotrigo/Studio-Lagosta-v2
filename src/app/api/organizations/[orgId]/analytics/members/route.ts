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

export const runtime = 'nodejs'
export const maxDuration = 60 // Heavy analytics aggregation with upsert operations

const DEFAULT_PERIOD: AnalyticsPeriodKey = '30d'

function parsePeriodParams(req: Request) {
  const searchParams = new URL(req.url).searchParams
  const periodParam = (searchParams.get('period') ?? DEFAULT_PERIOD) as AnalyticsPeriodKey
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const search = searchParams.get('search') ?? undefined
  const sortBy = searchParams.get('sortBy') ?? 'totalCreditsUsed'
  const order = searchParams.get('order') ?? 'desc'

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
    search,
    sortBy,
    order: order as 'asc' | 'desc',
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

    const { key, range, search, sortBy, order } = parsePeriodParams(req)

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

    let members = analytics.map((entry) => {
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

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      members = members.filter(
        (member) =>
          member.name?.toLowerCase().includes(searchLower) ||
          member.email?.toLowerCase().includes(searchLower)
      )
    }

    // Apply sorting
    members.sort((a, b) => {
      let aValue: number | string | null = 0
      let bValue: number | string | null = 0

      switch (sortBy) {
        case 'name':
          aValue = a.name ?? ''
          bValue = b.name ?? ''
          break
        case 'email':
          aValue = a.email ?? ''
          bValue = b.email ?? ''
          break
        case 'imageGenerations':
          aValue = a.stats.imageGenerations
          bValue = b.stats.imageGenerations
          break
        case 'videoGenerations':
          aValue = a.stats.videoGenerations
          bValue = b.stats.videoGenerations
          break
        case 'chatInteractions':
          aValue = a.stats.chatInteractions
          bValue = b.stats.chatInteractions
          break
        case 'totalCreditsUsed':
          aValue = a.stats.totalCreditsUsed
          bValue = b.stats.totalCreditsUsed
          break
        case 'lastActivityAt':
          aValue = a.stats.lastActivityAt ?? ''
          bValue = b.stats.lastActivityAt ?? ''
          break
        default:
          aValue = a.stats.totalCreditsUsed
          bValue = b.stats.totalCreditsUsed
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return order === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return order === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue)
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
