#!/usr/bin/env node
/**
 * Script to inspect a specific post in detail
 *
 * Usage:
 *   npm run inspect-post <postId>
 */

import { db } from '../lib/db'

async function main() {
  const postId = process.argv[2]

  if (!postId) {
    console.error('Usage: npm run inspect-post <postId>')
    process.exit(1)
  }

  console.log(`🔍 Inspecting Post: ${postId}`)
  console.log('=====================================\n')

  const post = await db.socialPost.findUnique({
    where: { id: postId },
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
      Generation: {
        select: {
          id: true,
          status: true,
          resultUrl: true,
        },
      },
    },
  })

  if (!post) {
    console.error('❌ Post not found')
    process.exit(1)
  }

  console.log('📄 Post Details:')
  console.log('----------------')
  console.log(`ID: ${post.id}`)
  console.log(`Project: ${post.Project.name} (ID: ${post.Project.id})`)
  console.log(`Type: ${post.postType}`)
  console.log(`Status: ${post.status}`)
  console.log(`Created: ${post.createdAt.toISOString()}`)
  console.log(`Updated: ${post.updatedAt.toISOString()}`)

  console.log('\n⏰ Scheduling:')
  console.log('-------------')
  console.log(`Scheduled: ${post.scheduledDatetime?.toISOString() || 'N/A'}`)
  console.log(`Sent At: ${post.sentAt?.toISOString() || 'N/A'}`)
  console.log(`Buffer Sent At: ${post.bufferSentAt?.toISOString() || 'N/A'}`)
  console.log(`Buffer ID: ${post.bufferId || 'N/A'}`)

  console.log('\n🔐 Verification:')
  console.log('----------------')
  console.log(`Verification Tag: ${post.verificationTag || 'N/A'}`)
  console.log(`Verification Status: ${post.verificationStatus || 'N/A'}`)
  console.log(`Verification Attempts: ${post.verificationAttempts}`)
  console.log(`Last Verification: ${post.lastVerificationAt?.toISOString() || 'N/A'}`)
  console.log(`Next Verification: ${post.nextVerificationAt?.toISOString() || 'N/A'}`)
  console.log(`Verification Error: ${post.verificationError || 'N/A'}`)
  console.log(`Verified Story ID: ${post.verifiedStoryId || 'N/A'}`)
  console.log(`Verified Permalink: ${post.verifiedPermalink || 'N/A'}`)
  console.log(`Verified Timestamp: ${post.verifiedTimestamp?.toISOString() || 'N/A'}`)
  console.log(`Verified By Fallback: ${post.verifiedByFallback}`)

  console.log('\n📷 Media:')
  console.log('---------')
  console.log(`Media URLs (${post.mediaUrls.length}):`)
  post.mediaUrls.forEach((url, i) => {
    console.log(`  [${i + 1}] ${url}`)
  })

  if (post.Generation) {
    console.log('\n🎨 Generation:')
    console.log('--------------')
    console.log(`ID: ${post.Generation.id}`)
    console.log(`Status: ${post.Generation.status}`)
    console.log(`Result URL: ${post.Generation.resultUrl || 'N/A'}`)
  }

  console.log('\n📝 Caption:')
  console.log('-----------')
  console.log(post.caption || '(no caption)')

  console.log('\n📱 Instagram Account:')
  console.log('---------------------')
  console.log(`Username: @${post.Project.instagramUsername || 'N/A'}`)
  console.log(`Account ID: ${post.Project.instagramAccountId || 'N/A'}`)
  console.log(`User ID: ${post.Project.instagramUserId || 'N/A'}`)

  // Check if verification should have happened
  if (post.postType === 'STORY' && post.status === 'POSTED') {
    console.log('\n✅ Verification should be active for this post')
  } else if (post.postType === 'STORY' && post.status === 'FAILED') {
    console.log('\n⚠️  Post failed to publish - verification not applicable')
  } else if (post.postType !== 'STORY') {
    console.log('\n⚠️  Not a story - verification not applicable')
  }

  console.log('\n✓ Inspection complete')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
