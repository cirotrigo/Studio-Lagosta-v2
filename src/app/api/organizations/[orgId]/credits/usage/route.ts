import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
} from '@/lib/organizations'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params

  try {
    await requireOrganizationMembership(orgId, {
      permissions: ['org:credits:view'],
    })

    const searchParams = new URL(req.url).searchParams
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
    const cursor = searchParams.get('cursor')

    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    const usage = await db.organizationUsage.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    })

    const hasMore = usage.length > limit
    const items = hasMore ? usage.slice(0, limit) : usage

    return NextResponse.json({
      data: items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Org Credits Usage] Failed to load usage', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar o histórico de créditos' },
      { status: 500 }
    )
  }
}
