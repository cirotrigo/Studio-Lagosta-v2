import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createProjectSchema } from '@/lib/validations/studio'

export const runtime = 'nodejs'

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

  const scheduledCounts = projectIds.length === 0
    ? []
    : await db.socialPost.groupBy({
        by: ['projectId'],
        where: {
          projectId: { in: projectIds },
          scheduledDatetime: { gte: now },
          status: { in: ['SCHEDULED', 'PROCESSING'] },
        },
        _count: {
          _all: true,
        },
      })

  const countsMap = scheduledCounts.reduce<Record<number, number>>((acc, item) => {
    acc[item.projectId] = item._count._all
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

    const project = await db.project.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        logoUrl: parsed.logoUrl,
        status: parsed.status ?? 'ACTIVE',
        userId,
      },
    })

    // Auto-share with organization if user is in organization context
    if (orgId) {
      const organization = await db.organization.findUnique({
        where: { clerkOrgId: orgId },
        select: { id: true, maxProjects: true },
      })

      if (organization) {
        // Check project limit for organization
        if (organization.maxProjects != null) {
          const currentCount = await db.organizationProject.count({
            where: { organizationId: organization.id },
          })

          // Only auto-share if within limit
          if (currentCount < organization.maxProjects) {
            await db.organizationProject.create({
              data: {
                organizationId: organization.id,
                projectId: project.id,
                sharedBy: userId,
                defaultCanEdit: true,
              },
            })
          } else {
            console.warn(
              `Project ${project.id} not auto-shared: organization ${orgId} has reached project limit`
            )
          }
        } else {
          // No limit, auto-share
          await db.organizationProject.create({
            data: {
              organizationId: organization.id,
              projectId: project.id,
              sharedBy: userId,
              defaultCanEdit: true,
            },
          })
        }
      }
    }

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Failed to create project', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
