import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
} from '@/lib/organizations'
import { fetchProjectWithShares } from '@/lib/projects/access'

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

    const projectIds = Array.from(
      new Set(
        items
          .map((entry) => {
            if (typeof entry.projectId === 'number' && Number.isFinite(entry.projectId)) {
              return entry.projectId
            }
            if (typeof entry.metadata === 'object' && entry.metadata !== null) {
              const metadataProjectId = (entry.metadata as { projectId?: number }).projectId
              if (typeof metadataProjectId === 'number' && Number.isFinite(metadataProjectId)) {
                return metadataProjectId
              }
            }
            return undefined
          })
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
      ),
    )

    const projects = projectIds.length
      ? await Promise.all(projectIds.map((id) => fetchProjectWithShares(id)))
      : []

    const projectMap = new Map<number, { name: string }>()
    projects.forEach((project, index) => {
      const id = projectIds[index]
      if (project && typeof project.name === 'string') {
        projectMap.set(id, { name: project.name })
      }
    })

    const enriched = items.map((entry) => {
      const metadata =
        typeof entry.metadata === 'object' && entry.metadata !== null
          ? (entry.metadata as Record<string, unknown>)
          : undefined

      const metadataProjectId = metadata?.projectId as number | undefined
      const projectId = entry.projectId ?? metadataProjectId
      const projectInfo = projectId ? projectMap.get(projectId) : undefined

      return {
        ...entry,
        metadata,
        projectId: projectId ?? null,
        project: projectInfo ? { id: projectId!, name: projectInfo.name } : undefined,
      }
    })

    return NextResponse.json({
      data: enriched,
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
