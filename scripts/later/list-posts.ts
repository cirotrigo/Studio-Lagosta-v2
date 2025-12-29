/**
 * List Later Posts
 * Shows all posts from database with Later integration
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(__dirname, '../../.env') })

import { db } from '@/lib/db'

async function listPosts() {
  console.log('📋 POSTS WITH LATER INTEGRATION\n')

  try {
    const posts = await db.socialPost.findMany({
      where: {
        laterPostId: {
          not: null,
        },
      },
      select: {
        id: true,
        laterPostId: true,
        postType: true,
        caption: true,
        scheduledDatetime: true,
        status: true,
        createdAt: true,
        Project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    })

    if (posts.length === 0) {
      console.log('No posts found with Later integration.')
      return
    }

    console.log(`Found ${posts.length} post(s):\n`)

    posts.forEach((post, index) => {
      console.log(`${index + 1}. ${post.Project.name} - ${post.postType}`)
      console.log(`   Database ID: ${post.id}`)
      console.log(`   Later Post ID: ${post.laterPostId}`)
      console.log(`   Caption: ${post.caption.substring(0, 50)}...`)
      console.log(`   Scheduled: ${post.scheduledDatetime?.toISOString() || 'N/A'}`)
      console.log(`   Status: ${post.status}`)
      console.log(`   Created: ${post.createdAt.toISOString()}`)
      console.log('')
    })

    console.log('\n💡 To test updating a post, run:')
    console.log(`   npx tsx scripts/later/test-update-post.ts <laterPostId>`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

listPosts()
