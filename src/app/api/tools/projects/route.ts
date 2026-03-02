import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserFromClerkId(clerkId)

    const projects = await db.project.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        status: true,
        logoUrl: true,
        instagramAccountId: true,
        instagramUsername: true,
        postingProvider: true,
        zapierWebhookUrl: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    return NextResponse.json(projects)
  } catch (error) {
    console.error('[API] GET /api/tools/projects error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}
