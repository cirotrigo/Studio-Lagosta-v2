import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
  resolveAnalyticsPeriod,
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

    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: {
        id: true,
        name: true,
        creditsPerMonth: true,
      },
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organização não encontrada' },
        { status: 404 }
      )
    }

    const whereClause = {
      organizationId: organization.id,
      createdAt: {
        gte: range.start,
        lte: range.end,
      },
      credits: {
        gt: 0,
      },
    }

    const [usageAggregates, featureBreakdown, distinctMembers, recentUsage] = await Promise.all([
      db.organizationUsage.aggregate({
        where: whereClause,
        _sum: { credits: true },
        _count: { _all: true },
      }),
      db.organizationUsage.groupBy({
        where: whereClause,
        by: ['feature'],
        _sum: { credits: true },
        _count: { feature: true },
        orderBy: { _sum: { credits: 'desc' } },
      }),
      db.organizationUsage.findMany({
        where: {
          ...whereClause,
          userId: { isSet: true },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      db.organizationUsage.findMany({
        where: {
          organizationId: organization.id,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          userId: true,
          feature: true,
          credits: true,
          createdAt: true,
          projectId: true,
        },
      }),
    ])

    const totalCreditsUsed = usageAggregates._sum.credits ?? 0
    const totalOperations = usageAggregates._count._all ?? 0
    const membersActive = distinctMembers.length

    const featureSummary = featureBreakdown.map((entry) => ({
      feature: entry.feature,
      operations: entry._count.feature,
      creditsUsed: entry._sum.credits ?? 0,
    }))

    return NextResponse.json({
      organization: {
        id: orgId,
        name: organization.name,
        creditsPerMonth: organization.creditsPerMonth,
      },
      period: {
        key,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      summary: {
        totalCreditsUsed,
        totalOperations,
        membersActive,
      },
      features: featureSummary,
      recentActivity: recentUsage.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        feature: entry.feature,
        credits: entry.credits,
        createdAt: entry.createdAt.toISOString(),
        projectId: entry.projectId,
      })),
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

    console.error('[Org Analytics] Failed to load analytics summary', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar os analytics da organização' },
      { status: 500 }
    )
  }
}
