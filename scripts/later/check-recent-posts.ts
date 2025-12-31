/**
 * Check Recent Posts
 * Shows recent posts with posting provider information
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { PrismaClient } from '../../prisma/generated/client'

const db = new PrismaClient()

async function checkRecentPosts(projectName: string) {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('📋 RECENT POSTS - POSTING PROVIDER CHECK')
    console.log('='.repeat(80))
    console.log(`📌 Project: ${projectName}`)
    console.log('='.repeat(80) + '\n')

    // Find project
    const project = await db.project.findFirst({
      where: {
        name: {
          equals: projectName,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        postingProvider: true,
        laterAccountId: true,
        laterProfileId: true,
      }
    })

    if (!project) {
      console.log('❌ Project not found\n')
      return
    }

    console.log(`📊 Current Configuration:`)
    console.log(`   Provider: ${project.postingProvider}`)
    console.log(`   Later Account ID: ${project.laterAccountId || 'NOT SET'}`)
    console.log(`   Later Profile ID: ${project.laterProfileId || 'NOT SET'}`)

    // Get recent posts (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const recentPosts = await db.socialPost.findMany({
      where: {
        projectId: project.id,
        createdAt: {
          gte: yesterday
        }
      },
      select: {
        id: true,
        caption: true,
        postType: true,
        status: true,
        scheduleType: true,
        scheduledDatetime: true,
        sentAt: true,
        laterPostId: true,
        createdAt: true,
        lateStatus: true,
        latePublishedAt: true,
        latePlatformUrl: true,
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    })

    if (recentPosts.length === 0) {
      console.log('\n📭 No posts found in the last 24 hours\n')
      return
    }

    console.log(`\n📬 Found ${recentPosts.length} post(s) in the last 24 hours:\n`)
    console.log('='.repeat(80))

    recentPosts.forEach((post, index) => {
      const captionPreview = post.caption.length > 50
        ? post.caption.substring(0, 50) + '...'
        : post.caption

      console.log(`\n${index + 1}. Post ID: ${post.id}`)
      console.log(`   Caption: "${captionPreview}"`)
      console.log(`   Type: ${post.postType}`)
      console.log(`   Status: ${post.status}`)
      console.log(`   Schedule Type: ${post.scheduleType}`)
      console.log(`   Created: ${post.createdAt.toLocaleString('pt-BR')}`)

      if (post.scheduledDatetime) {
        console.log(`   Scheduled For: ${post.scheduledDatetime.toLocaleString('pt-BR')}`)
      }

      if (post.sentAt) {
        console.log(`   Sent At: ${post.sentAt.toLocaleString('pt-BR')}`)
      }

      // Check which provider was used
      if (post.laterPostId) {
        console.log(`   ✅ SENT VIA LATE API`)
        console.log(`   Later Post ID: ${post.laterPostId}`)
        console.log(`   Late Status: ${post.lateStatus || 'N/A'}`)
        if (post.latePublishedAt) {
          console.log(`   Late Published At: ${post.latePublishedAt.toLocaleString('pt-BR')}`)
        }
        if (post.latePlatformUrl) {
          console.log(`   Instagram URL: ${post.latePlatformUrl}`)
        }
      } else {
        console.log(`   ⚠️  SENT VIA ZAPIER/BUFFER (or not processed yet)`)
        console.log(`   Note: This post does not have a laterPostId`)
      }
    })

    console.log('\n' + '='.repeat(80))
    console.log('\n💡 TIP: Posts sent via Late API should have a laterPostId')
    console.log('   If laterPostId is missing, the post was sent via Zapier/Buffer\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

// Get project name from command line
const projectName = process.argv[2]

if (!projectName) {
  console.error('\nUsage: npx tsx scripts/later/check-recent-posts.ts "Project Name"')
  console.error('\nExample: npx tsx scripts/later/check-recent-posts.ts "Espeto Gaúcho"\n')
  process.exit(1)
}

checkRecentPosts(projectName)
