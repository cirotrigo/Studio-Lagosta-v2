import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { withRetry } from '@/lib/db-utils'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * GET /api/projects/scheduled-counts
 * Returns scheduled post counts for all user's projects
 * This is separated from the main /api/projects endpoint for performance optimization
 */
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Get all project IDs the user has access to
  const ownedProjects = await db.project.findMany({
    where: { userId },
    select: { id: true },
  })

  let sharedProjectIds: number[] = []
  if (orgId) {
    const sharedProjects = await db.project.findMany({
      where: {
        organizationProjects: {
          some: {
            organization: {
              clerkOrgId: orgId,
            },
          },
        },
      },
      select: { id: true },
    })
    sharedProjectIds = sharedProjects.map(p => p.id)
  }

  const ownedIds = new Set(ownedProjects.map(p => p.id))
  const allProjectIds = [...ownedProjects.map(p => p.id), ...sharedProjectIds.filter(id => !ownedIds.has(id))]

  if (allProjectIds.length === 0) {
    return NextResponse.json({})
  }

  const now = new Date()

  // Use retry logic for database queries to handle Neon cold starts
  const [nonRecurringCounts, recurringPosts] = await withRetry(
    async () => {
      return await Promise.all([
        // Count future scheduled posts (non-recurring) using groupBy for performance
        db.socialPost.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: allProjectIds },
            status: { in: ['SCHEDULED', 'POSTING'] },
            scheduleType: { not: 'RECURRING' },
            scheduledDatetime: { gte: now },
          },
          _count: {
            id: true,
          },
        }),
        // For recurring posts, fetch and filter by endDate
        db.socialPost.findMany({
          where: {
            projectId: { in: allProjectIds },
            status: { in: ['SCHEDULED', 'POSTING'] },
            scheduleType: 'RECURRING',
          },
          select: {
            projectId: true,
            recurringConfig: true,
          },
        }),
      ])
    },
    {
      maxRetries: 3,
      delayMs: 500,
    }
  )

  // Filter recurring posts by endDate and group by project
  const activeRecurringByProject = recurringPosts.reduce<Record<number, number>>((acc, post) => {
    if (post.recurringConfig && typeof post.recurringConfig === 'object') {
      const config = post.recurringConfig as { endDate?: string }
      if (!config.endDate) {
        // No end date = always active
        acc[post.projectId] = (acc[post.projectId] || 0) + 1
      } else {
        const endDate = new Date(config.endDate)
        if (endDate >= now) {
          acc[post.projectId] = (acc[post.projectId] || 0) + 1
        }
      }
    }
    return acc
  }, {})

  // Combine counts from both queries
  const countsMap: Record<number, number> = {}

  // Add non-recurring counts
  for (const item of nonRecurringCounts) {
    if (item.projectId) {
      countsMap[item.projectId] = item._count.id
    }
  }

  // Add recurring counts
  for (const [projectId, count] of Object.entries(activeRecurringByProject)) {
    const id = parseInt(projectId)
    countsMap[id] = (countsMap[id] || 0) + count
  }

  return NextResponse.json(countsMap)
}
