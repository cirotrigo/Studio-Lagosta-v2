import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostType } from '@prisma/client'

/**
 * GET /api/posts/calendar
 * Busca posts de todos os projetos do usuário para o calendário
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Get user from database
    const user = await getUserFromClerkId(userId)
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const postType = searchParams.get('postType')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate e endDate são obrigatórios' },
        { status: 400 }
      )
    }

    // Get auth info for organization access
    const { orgId } = await auth()

    // Get user's own projects
    const ownedProjects = await db.project.findMany({
      where: { userId: user.id },
      select: { id: true },
    })

    // Get organization shared projects if user is in an org
    let sharedProjects: { id: number }[] = []
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
        select: { id: true },
      })
    }

    // Combine project IDs (deduplicated)
    const ownedIds = new Set(ownedProjects.map(p => p.id))
    const allProjectIds = [
      ...ownedProjects.map(p => p.id),
      ...sharedProjects.filter(p => !ownedIds.has(p.id)).map(p => p.id),
    ]

    // Fetch regular scheduled posts
    const scheduledPosts = await db.socialPost.findMany({
      where: {
        projectId: { in: allProjectIds },
        scheduleType: { in: ['SCHEDULED', 'IMMEDIATE'] },
        scheduledDatetime: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        ...(postType && postType !== 'ALL' ? { postType: postType as PostType } : {}),
      },
      include: {
        Project: {
          select: {
            id: true,
            name: true,
            instagramUsername: true,
            logoUrl: true,
            Logo: {
              where: {
                isProjectLogo: true,
              },
              select: {
                fileUrl: true,
              },
              take: 1,
            },
          },
        },
      },
    })

    // Fetch active recurring posts (they don't have scheduledDatetime in range)
    const recurringPosts = await db.socialPost.findMany({
      where: {
        projectId: { in: allProjectIds },
        scheduleType: 'RECURRING',
        status: { in: ['SCHEDULED', 'POSTING'] },
        ...(postType && postType !== 'ALL' ? { postType: postType as PostType } : {}),
      },
      include: {
        Project: {
          select: {
            id: true,
            name: true,
            instagramUsername: true,
            logoUrl: true,
            Logo: {
              where: {
                isProjectLogo: true,
              },
              select: {
                fileUrl: true,
              },
              take: 1,
            },
          },
        },
      },
    })

    // Filter and expand recurring posts to show their next occurrence in the date range
    const rangeStart = new Date(startDate)
    const rangeEnd = new Date(endDate)
    const now = new Date()

    const expandedRecurringPosts = recurringPosts.filter(post => {
      if (!post.recurringConfig || typeof post.recurringConfig !== 'object') return false

      const config = post.recurringConfig as { endDate?: string }
      // Check if recurring post is still active
      if (config.endDate) {
        const endDate = new Date(config.endDate)
        if (endDate < now) return false // Already ended
      }

      return true
    }).map(post => {
      // For simplicity, we'll show recurring posts on the first day of the range
      // A more sophisticated implementation would calculate exact occurrences
      return {
        ...post,
        scheduledDatetime: rangeStart,
        isRecurringPlaceholder: true,
      }
    })

    // Combine all posts and sort by date
    const allPosts = [...scheduledPosts, ...expandedRecurringPosts].sort((a, b) => {
      const dateA = a.scheduledDatetime?.getTime() || 0
      const dateB = b.scheduledDatetime?.getTime() || 0
      return dateA - dateB
    })

    return NextResponse.json(allPosts)
  } catch (error) {
    console.error('[POSTS_CALENDAR_GET]', error)
    return NextResponse.json(
      { error: 'Erro ao buscar posts' },
      { status: 500 }
    )
  }
}
