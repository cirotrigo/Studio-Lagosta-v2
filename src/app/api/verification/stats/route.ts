import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { PostType, VerificationStatus } from '../../../../../prisma/generated/client'

/**
 * GET /api/verification/stats
 *
 * Returns verification statistics for user's story posts
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
    const baseWhere = {
      postType: PostType.STORY,
      ...(projectId
        ? {
            projectId,
            Project: {
              userId: dbUser.id,
            },
          }
        : {
            Project: {
              userId: dbUser.id,
            },
          }),
    }

    // Get counts for each status
    const [total, verified, pending, failed, skipped] = await Promise.all([
      db.socialPost.count({
        where: baseWhere,
      }),
      db.socialPost.count({
        where: {
          ...baseWhere,
          verificationStatus: VerificationStatus.VERIFIED,
        },
      }),
      db.socialPost.count({
        where: {
          ...baseWhere,
          verificationStatus: VerificationStatus.PENDING,
        },
      }),
      db.socialPost.count({
        where: {
          ...baseWhere,
          verificationStatus: VerificationStatus.VERIFICATION_FAILED,
        },
      }),
      db.socialPost.count({
        where: {
          ...baseWhere,
          verificationStatus: VerificationStatus.SKIPPED,
        },
      }),
    ])

    // Count verified by fallback
    const verifiedByFallback = await db.socialPost.count({
      where: {
        ...baseWhere,
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedByFallback: true,
      },
    })

    return NextResponse.json({
      total,
      verified,
      pending,
      failed,
      skipped,
      verifiedByFallback,
    })
  } catch (error) {
    console.error('[Verification Stats API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
