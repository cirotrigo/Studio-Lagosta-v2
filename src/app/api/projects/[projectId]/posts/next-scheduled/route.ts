import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

/**
 * GET /api/projects/[projectId]/posts/next-scheduled
 * Retorna a data do próximo post agendado para o projeto
 * Note: Mostra posts de todos os membros da organização
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: projectIdParam } = await params
  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = parseInt(projectIdParam)
    const now = new Date()

    // Buscar o próximo post agendado (futuro)
    // Note: Removed userId filter to show posts from all organization members
    const nextPost = await db.socialPost.findFirst({
      where: {
        projectId,
        status: { in: ['SCHEDULED', 'POSTING'] },
        scheduleType: { in: ['SCHEDULED', 'IMMEDIATE'] },
        scheduledDatetime: {
          gte: now,
        },
      },
      select: {
        id: true,
        scheduledDatetime: true,
      },
      orderBy: {
        scheduledDatetime: 'asc',
      },
    })

    if (!nextPost || !nextPost.scheduledDatetime) {
      return NextResponse.json({ nextDate: null })
    }

    return NextResponse.json({
      nextDate: nextPost.scheduledDatetime,
      postId: nextPost.id,
    })
  } catch (error) {
    console.error('[NEXT_SCHEDULED_GET] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
