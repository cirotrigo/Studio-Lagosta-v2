import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostType, VerificationStatus } from '../../../../../prisma/generated/client'

/**
 * GET /api/verification/failed
 *
 * Returns list of posts with verification failed status
 * Optionally filter by projectId
 *
 * Query params:
 *   - projectId (optional): Filter by project ID
 */
export async function GET(request: Request) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await getUserFromClerkId(userId)

    // Parse query params
    const { searchParams } = new URL(request.url)
    const projectIdParam = searchParams.get('projectId')
    const projectId = projectIdParam ? parseInt(projectIdParam, 10) : undefined

    // Build where clause
    const where = {
      postType: PostType.STORY,
      verificationStatus: VerificationStatus.VERIFICATION_FAILED,
      ...(projectId
        ? {
            projectId,
            Project: {
              userId: dbUser.id, // Ensure user owns the project
            },
          }
        : {
            Project: {
              userId: dbUser.id, // Only show posts from user's projects
            },
          }),
    }

    // Fetch failed posts
    const posts = await db.socialPost.findMany({
      where,
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
        lastVerificationAt: 'desc',
      },
      take: 100, // Limit to 100 most recent
    })

    return NextResponse.json(posts)
  } catch (error) {
    console.error('[Verification Failed API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
