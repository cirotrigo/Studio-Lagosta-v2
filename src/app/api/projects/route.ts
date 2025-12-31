import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createProjectSchema } from '@/lib/validations/studio'
import { fulfillInviteForUser } from '@/lib/services/client-invite-service'
import { getLaterClient } from '@/lib/later/client'

export const runtime = 'nodejs'
export const maxDuration = 60 // Complex queries with multiple JOINs and aggregations

const ORG_PROJECT_LIMIT_ERROR = 'ORG_PROJECT_LIMIT_REACHED'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const dbUser = await db.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, email: true, clerkId: true },
  })

  if (dbUser) {
    try {
      await fulfillInviteForUser({
        userId: dbUser.id,
        clerkUserId: dbUser.clerkId,
        email: dbUser.email,
      })
    } catch (error) {
      console.error('[projects] Failed to fulfill client invite on GET', error)
    }
  }

  // Parallel fetching for owned and shared projects
  const [ownedProjects, sharedProjects] = await Promise.all([
    // Owned projects query
    db.project.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        logoUrl: true,
        googleDriveFolderId: true,
        googleDriveFolderName: true,
        googleDriveImagesFolderId: true,
        googleDriveImagesFolderName: true,
        googleDriveVideosFolderId: true,
        googleDriveVideosFolderName: true,
        instagramAccountId: true,
        instagramUsername: true,
        laterAccountId: true,
        laterProfileId: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        workspaceId: true,
        _count: {
          select: { Template: true, Generation: true },
        },
        Logo: {
          where: { isProjectLogo: true },
          take: 1,
          select: {
            id: true,
            fileUrl: true,
          },
        },
        organizationProjects: {
          select: {
            defaultCanEdit: true,
            sharedAt: true,
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
    }),

    // Shared projects query (only if orgId exists)
    orgId ? db.project.findMany({
      where: {
        organizationProjects: {
          some: {
            organization: {
              clerkOrgId: orgId,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        logoUrl: true,
        googleDriveFolderId: true,
        googleDriveFolderName: true,
        googleDriveImagesFolderId: true,
        googleDriveImagesFolderName: true,
        googleDriveVideosFolderId: true,
        googleDriveVideosFolderName: true,
        instagramAccountId: true,
        instagramUsername: true,
        laterAccountId: true,
        laterProfileId: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        workspaceId: true,
        _count: {
          select: { Template: true, Generation: true },
        },
        Logo: {
          where: { isProjectLogo: true },
          take: 1,
          select: {
            id: true,
            fileUrl: true,
          },
        },
        organizationProjects: {
          select: {
            defaultCanEdit: true,
            sharedAt: true,
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
    }) : Promise.resolve([]),
  ])

  // Combine and deduplicate projects
  const ownedIds = new Set(ownedProjects.map((project) => project.id))
  const combined = [...ownedProjects, ...sharedProjects.filter((project) => !ownedIds.has(project.id))]

  // Fetch followers count from Later API for projects with laterAccountId
  const followersMap = new Map<string, number>()

  try {
    const laterClient = getLaterClient()
    const projectsWithLater = combined.filter(p => p.laterAccountId)
    const uniqueLaterAccountIds = [...new Set(projectsWithLater.map(p => p.laterAccountId))]

    // Fetch account data in parallel for all unique Later accounts
    const accountPromises = uniqueLaterAccountIds.map(async (accountId) => {
      if (!accountId) return null
      try {
        const account = await laterClient.getAccount(accountId)
        const followers = account.metadata?.profileData?.followersCount || null
        if (followers !== null) {
          followersMap.set(accountId, followers)
        }
        console.log(`[Projects API] ✅ Fetched followers for ${accountId}: ${followers}`)
        return { accountId, followers }
      } catch (error) {
        console.error(`[Projects API] ❌ Failed to fetch Later account ${accountId}:`, error)
        return null
      }
    })

    await Promise.allSettled(accountPromises)
  } catch (error) {
    console.error('[Projects API] Error fetching Later followers:', error)
    // Continue without followers data
  }

  // OPTIMIZATION: Return projects immediately without scheduled post counts
  // Scheduled post counts can be fetched separately on-demand via /api/projects/scheduled-counts
  const response = combined.map((project) => {
    const { organizationProjects, ...rest } = project

    return {
      ...rest,
      scheduledPostCount: 0, // Default to 0, fetch separately if needed
      followers: rest.laterAccountId ? (followersMap.get(rest.laterAccountId) || null) : null,
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
