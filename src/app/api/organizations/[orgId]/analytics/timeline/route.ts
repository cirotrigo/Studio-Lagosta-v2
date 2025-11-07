import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireOrganizationMembership, OrganizationAccessError } from '@/lib/organizations'

export const runtime = 'nodejs'
export const maxDuration = 60 // Analytics queries can be heavy with large datasets

type Period = '7d' | '30d' | '90d' | 'custom'

function getPeriodDates(period: Period, customStart?: string, customEnd?: string) {
  const end = new Date()
  const start = new Date()

  if (period === 'custom' && customStart && customEnd) {
    start.setTime(new Date(customStart).getTime())
    end.setTime(new Date(customEnd).getTime())
  } else {
    switch (period) {
      case '7d':
        start.setDate(start.getDate() - 7)
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        break
      case '90d':
        start.setDate(start.getDate() - 90)
        break
      default:
        start.setDate(start.getDate() - 30)
    }
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * GET /api/organizations/[orgId]/analytics/timeline
 *
 * Returns aggregated usage data by day for visualization in charts
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params
    await requireOrganizationMembership(orgId)

    const url = new URL(req.url)
    const period = (url.searchParams.get('period') || '30d') as Period
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    const { start, end } = getPeriodDates(period, startDate || undefined, endDate || undefined)

    // Get organization to access its ID
    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organização não encontrada' },
        { status: 404 }
      )
    }

    // Get all usage records in the period
    const usageRecords = await db.organizationUsage.findMany({
      where: {
        organizationId: organization.id,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        feature: true,
        credits: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    // Aggregate data by date
    const timelineMap = new Map<string, {
      date: string
      imageGenerations: number
      videoGenerations: number
      chatInteractions: number
      creditsUsed: number
    }>()

    // Initialize all dates in the period with zero values
    const currentDate = new Date(start)
    while (currentDate <= end) {
      const dateKey = formatDate(currentDate)
      timelineMap.set(dateKey, {
        date: dateKey,
        imageGenerations: 0,
        videoGenerations: 0,
        chatInteractions: 0,
        creditsUsed: 0,
      })
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Aggregate usage records
    for (const record of usageRecords) {
      const dateKey = formatDate(record.createdAt)
      const dayData = timelineMap.get(dateKey)

      if (dayData) {
        dayData.creditsUsed += record.credits

        // Count operations by feature type
        const feature = record.feature.toLowerCase()
        if (feature.includes('image') || feature.includes('ai_image')) {
          dayData.imageGenerations += 1
        } else if (feature.includes('video')) {
          dayData.videoGenerations += 1
        } else if (feature.includes('chat') || feature.includes('ai_text')) {
          dayData.chatInteractions += 1
        }
      }
    }

    // Convert map to array
    const timeline = Array.from(timelineMap.values())

    return NextResponse.json({
      period: {
        key: period,
        start: start.toISOString(),
        end: end.toISOString(),
      },
      timeline,
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Org Analytics Timeline] Failed to fetch timeline', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar a timeline de analytics' },
      { status: 500 }
    )
  }
}
