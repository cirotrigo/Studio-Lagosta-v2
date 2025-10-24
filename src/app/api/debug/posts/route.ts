import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

/**
 * DEBUG ENDPOINT - List all posts with their details
 * GET /api/debug/posts?projectId=X
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const user = await getUserFromClerkId(userId)
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId é obrigatório' }, { status: 400 })
    }

    const posts = await db.socialPost.findMany({
      where: {
        projectId: parseInt(projectId),
      },
      include: {
        Project: {
          select: {
            id: true,
            name: true,
            instagramUsername: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const now = new Date()
    const postsWithDebug = posts.map(post => {
      let isActive = false
      let reason = ''

      if (post.scheduleType !== 'RECURRING') {
        isActive = post.scheduledDatetime ? post.scheduledDatetime >= now : false
        reason = isActive ? `Scheduled for ${post.scheduledDatetime?.toISOString()}` : 'Past scheduled date'
      } else {
        if (post.recurringConfig && typeof post.recurringConfig === 'object') {
          const config = post.recurringConfig as { endDate?: string }
          if (!config.endDate) {
            isActive = true
            reason = 'Recurring, no end date'
          } else {
            const endDate = new Date(config.endDate)
            isActive = endDate >= now
            reason = isActive ? `Recurring until ${config.endDate}` : `Recurring ended ${config.endDate}`
          }
        } else {
          reason = 'Recurring but no config'
        }
      }

      return {
        id: post.id,
        projectName: post.Project.name,
        postType: post.postType,
        scheduleType: post.scheduleType,
        status: post.status,
        scheduledDatetime: post.scheduledDatetime?.toISOString(),
        recurringConfig: post.recurringConfig,
        caption: post.caption.substring(0, 50) + '...',
        isActive,
        reason,
        createdAt: post.createdAt,
      }
    })

    return NextResponse.json({
      total: posts.length,
      active: postsWithDebug.filter(p => p.isActive && ['SCHEDULED', 'PROCESSING'].includes(p.status)).length,
      posts: postsWithDebug,
    })
  } catch (error) {
    console.error('[DEBUG_POSTS]', error)
    return NextResponse.json({ error: 'Erro ao buscar posts' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
