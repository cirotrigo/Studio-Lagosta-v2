#!/usr/bin/env node
/**
 * Script to debug verification issues
 *
 * Usage:
 *   npm run debug-verification [projectName]
 */

import { db } from '../lib/db'
import { PostType, VerificationStatus } from '../../prisma/generated/client'

async function main() {
  const projectName = process.argv[2]

  console.log('🔍 Instagram Story Verification Debug')
  console.log('=====================================\n')

  // Build where clause
  const where = {
    postType: PostType.STORY,
    ...(projectName
      ? {
          Project: {
            name: {
              contains: projectName,
              mode: 'insensitive' as const,
            },
          },
        }
      : {}),
  }

  // Get all story posts
  const posts = await db.socialPost.findMany({
    where,
    include: {
      Project: {
        select: {
          id: true,
          name: true,
          instagramUsername: true,
          instagramAccountId: true,
          instagramUserId: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  })

  console.log(`Found ${posts.length} story posts${projectName ? ` for project "${projectName}"` : ''}\n`)

  // Group by verification status
  const byStatus = posts.reduce((acc, post) => {
    const status = post.verificationStatus || 'NULL'
    if (!acc[status]) acc[status] = []
    acc[status].push(post)
    return acc
  }, {} as Record<string, typeof posts>)

  // Show summary
  console.log('📊 Summary by Status:')
  console.log('---------------------')
  Object.keys(byStatus)
    .sort()
    .forEach((status) => {
      console.log(`  ${status}: ${byStatus[status].length} posts`)
    })
  console.log('')

  // Show failed posts in detail
  const failed = byStatus[VerificationStatus.VERIFICATION_FAILED] || []
  if (failed.length > 0) {
    console.log(`❌ Failed Posts (${failed.length}):`)
    console.log('=====================================')

    for (const post of failed) {
      console.log(`\nPost ID: ${post.id}`)
      console.log(`  Project: ${post.Project.name} (@${post.Project.instagramUsername || 'N/A'})`)
      console.log(`  Instagram Account ID: ${post.Project.instagramAccountId || 'N/A'}`)
      console.log(`  Instagram User ID: ${post.Project.instagramUserId || 'N/A'}`)
      console.log(`  Status: ${post.status}`)
      console.log(`  Created: ${post.createdAt.toISOString()}`)
      console.log(`  Scheduled: ${post.scheduledDatetime?.toISOString() || 'N/A'}`)
      console.log(`  Sent At: ${post.sentAt?.toISOString() || 'N/A'}`)
      console.log(`  Buffer Sent At: ${post.bufferSentAt?.toISOString() || 'N/A'}`)
      console.log(`  Verification Tag: ${post.verificationTag || 'N/A'}`)
      console.log(`  Verification Status: ${post.verificationStatus}`)
      console.log(`  Verification Attempts: ${post.verificationAttempts}`)
      console.log(`  Last Verification: ${post.lastVerificationAt?.toISOString() || 'N/A'}`)
      console.log(`  Next Verification: ${post.nextVerificationAt?.toISOString() || 'N/A'}`)
      console.log(`  Verification Error: ${post.verificationError || 'N/A'}`)
      console.log(`  Media URLs (${post.mediaUrls.length}):`)
      post.mediaUrls.forEach((url, i) => {
        console.log(`    [${i + 1}] ${url.substring(0, 80)}...`)
      })
      console.log(`  Caption: ${post.caption ? post.caption.substring(0, 100) + '...' : 'N/A'}`)
    }
  }

  // Show pending posts
  const pending = byStatus[VerificationStatus.PENDING] || []
  if (pending.length > 0) {
    console.log(`\n⏱️  Pending Posts (${pending.length}):`)
    console.log('=====================================')

    for (const post of pending) {
      console.log(`\nPost ID: ${post.id}`)
      console.log(`  Project: ${post.Project.name}`)
      console.log(`  Status: ${post.status}`)
      console.log(`  Next Verification: ${post.nextVerificationAt?.toISOString() || 'N/A'}`)
      console.log(`  Attempts: ${post.verificationAttempts}`)
    }
  }

  // Show verified posts
  const verified = byStatus[VerificationStatus.VERIFIED] || []
  if (verified.length > 0) {
    console.log(`\n✅ Verified Posts (${verified.length}):`)
    console.log('=====================================')

    const byFallback = verified.filter((p) => p.verifiedByFallback)
    console.log(`  By TAG: ${verified.length - byFallback.length}`)
    console.log(`  By Fallback: ${byFallback.length}`)

    if (byFallback.length > 0) {
      console.log('\n  Fallback Verifications:')
      for (const post of byFallback) {
        console.log(`    - ${post.id} (${post.Project.name}): ${post.verifiedStoryId}`)
      }
    }
  }

  // Check for posts without tags
  const noTag = posts.filter((p) => !p.verificationTag)
  if (noTag.length > 0) {
    console.log(`\n⚠️  Posts Without Tags (${noTag.length}):`)
    console.log('=====================================')
    for (const post of noTag) {
      console.log(`  - ${post.id} (${post.Project.name}) - Created: ${post.createdAt.toISOString()}`)
    }
  }

  console.log('\n✓ Debug complete')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
