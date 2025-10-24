import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createProjectSchema } from '@/lib/validations/studio'

export const runtime = 'nodejs'
export const maxDuration = 60 // Complex queries with multiple JOINs and aggregations

const ORG_PROJECT_LIMIT_ERROR = 'ORG_PROJECT_LIMIT_REACHED'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const ownedProjects = await db.project.findMany({
    where: { userId },
    include: {
      _count: {
        select: { Template: true, Generation: true },
      },
      Logo: {
        where: { isProjectLogo: true },
        take: 1,
      },
      organizationProjects: {
        include: {
          organization: {
            select: {
              clerkOrgId: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  let sharedProjects: typeof ownedProjects = []

  if (orgId) {
    sharedProjects = await db.project.findMany({
      where: {
        organizationProjects: {
          some: {
            organization: {
              clerkOrgId: orgId,
            },
          },
        },
      },
      include: {
        _count: {
          select: { Template: true, Generation: true },
        },
        Logo: {
          where: { isProjectLogo: true },
          take: 1,
        },
        organizationProjects: {
          include: {
            organization: {
              select: {
                clerkOrgId: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  const ownedIds = new Set(ownedProjects.map((project) => project.id))
  const combined = [...ownedProjects, ...sharedProjects.filter((project) => !ownedIds.has(project.id))]

  const projectIds = combined.map((project) => project.id)
  const now = new Date()

  // Count scheduled posts: future scheduled posts OR active recurring posts
  // For recurring posts, we need to fetch and check the endDate from JSON
  const allScheduledPosts = projectIds.length === 0
    ? []
    : await db.socialPost.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ['SCHEDULED', 'PROCESSING'] },
        },
        select: {
          projectId: true,
          scheduleType: true,
          scheduledDatetime: true,
          recurringConfig: true,
        },
      })

  // Filter posts based on schedule type
  const activePosts = allScheduledPosts.filter(post => {
    // For non-recurring posts, check if scheduled time is in the future
    if (post.scheduleType !== 'RECURRING') {
      return post.scheduledDatetime && post.scheduledDatetime >= now
    }

    // For recurring posts, check if they're still active (no endDate or endDate in future)
    if (post.recurringConfig && typeof post.recurringConfig === 'object') {
      const config = post.recurringConfig as { endDate?: string }
      if (!config.endDate) return true // No end date = always active
      const endDate = new Date(config.endDate)
      return endDate >= now
    }

    return false
  })

  // Group by projectId
  const countsMap = activePosts.reduce<Record<number, number>>((acc, post) => {
    acc[post.projectId] = (acc[post.projectId] || 0) + 1
    return acc
  }, {})

  const response = combined.map((project) => {
    const { organizationProjects, ...rest } = project

    return {
      ...rest,
      scheduledPostCount: countsMap[project.id] ?? 0,
      organizationShares: organizationProjects.map((share) => ({
        organizationId: share.organization.clerkOrgId,
        organizationName: share.organization.name,
        defaultCanEdit: share.defaultCanEdit,
        sharedAt: share.sharedAt,
      })),
    }
  })

  return NextResponse.json(response)
}

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const payload = await req.json()
    const parsed = createProjectSchema.parse(payload)

    let organization: { id: string; maxProjects: number | null } | null = null

    if (orgId) {
      organization = await db.organization.findUnique({
        where: { clerkOrgId: orgId },
        select: { id: true, maxProjects: true },
      })

      if (!organization) {
        return NextResponse.json(
          { error: 'Organização não encontrada' },
          { status: 404 }
        )
      }
    }

    const project = await db.$transaction(async (tx) => {
      if (organization?.maxProjects != null) {
        const currentCount = await tx.organizationProject.count({
          where: { organizationId: organization.id },
        })

        if (currentCount >= organization.maxProjects) {
          throw new Error(ORG_PROJECT_LIMIT_ERROR)
        }
      }

      const createdProject = await tx.project.create({
        data: {
          name: parsed.name,
          description: parsed.description,
          logoUrl: parsed.logoUrl,
          status: parsed.status ?? 'ACTIVE',
          userId,
        },
      })

      if (organization) {
        await tx.organizationProject.create({
          data: {
            organizationId: organization.id,
            projectId: createdProject.id,
            sharedBy: userId,
            defaultCanEdit: true,
          },
        })
      }

      return createdProject
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === ORG_PROJECT_LIMIT_ERROR) {
      return NextResponse.json(
        { error: 'Limite de projetos compartilhados atingido para este plano' },
        { status: 403 }
      )
    }

    console.error('Failed to create project', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
