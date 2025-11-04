import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

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

  // Count scheduled posts: future scheduled posts OR active recurring posts
  const allScheduledPosts = await db.socialPost.findMany({
    where: {
      projectId: { in: allProjectIds },
      status: { in: ['SCHEDULED', 'POSTING'] },
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

  return NextResponse.json(countsMap)
}
