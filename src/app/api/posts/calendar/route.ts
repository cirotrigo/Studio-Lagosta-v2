import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

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

    // Build where clause
    const where = {
      project: {
        userId: user.id,
      },
      scheduledDatetime: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      ...(postType && postType !== 'ALL' ? { postType } : {}),
    }

    // Fetch posts from all user projects
    const posts = await db.socialPost.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            instagramUsername: true,
          },
        },
      },
      orderBy: {
        scheduledDatetime: 'asc',
      },
    })

    return NextResponse.json(posts)
  } catch (error) {
    console.error('[POSTS_CALENDAR_GET]', error)
    return NextResponse.json(
      { error: 'Erro ao buscar posts' },
      { status: 500 }
    )
  }
}
