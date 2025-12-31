/**
 * Check Post Error Details
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkPostError() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 POST ERROR DETAILS')
    console.log('='.repeat(80) + '\n')

    const postId = 'cmjud68ic0001sw7raqnx8h2i'

    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        status: true,
        laterPostId: true,
        errorMessage: true,
        failedAt: true,
        createdAt: true,
        scheduledDatetime: true,
        Project: {
          select: {
            name: true,
            postingProvider: true,
            laterAccountId: true,
            laterProfileId: true,
          }
        }
      }
    })

    if (!post) {
      console.log('❌ Post not found\n')
      return
    }

    console.log(`📋 Post ID: ${post.id}`)
    console.log(`📊 Status: ${post.status}`)
    console.log(`📅 Created: ${post.createdAt.toLocaleString('pt-BR')}`)
    console.log(`⏰ Scheduled For: ${post.scheduledDatetime?.toLocaleString('pt-BR')}`)
    console.log(`❌ Failed At: ${post.failedAt?.toLocaleString('pt-BR') || 'N/A'}`)
    console.log(`\n🏢 Project: ${post.Project.name}`)
    console.log(`📤 Provider: ${post.Project.postingProvider}`)
    console.log(`🔑 Later Account ID: ${post.Project.laterAccountId || 'NOT SET'}`)
    console.log(`🆔 Later Profile ID: ${post.Project.laterProfileId || 'NOT SET'}`)
    console.log(`\n🆔 Later Post ID: ${post.laterPostId || 'NOT CREATED'}`)

    if (post.errorMessage) {
      console.log(`\n❌ ERROR MESSAGE:`)
      console.log('='.repeat(80))
      console.log(post.errorMessage)
      console.log('='.repeat(80))
    } else {
      console.log(`\n⚠️  No error message found`)
    }

    // Check post logs
    const logs = await db.postLog.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    if (logs.length > 0) {
      console.log(`\n📜 POST LOGS (${logs.length} entries):`)
      console.log('='.repeat(80))
      logs.forEach((log, i) => {
        console.log(`\n${i + 1}. [${log.event}] ${log.createdAt.toLocaleString('pt-BR')}`)
        console.log(`   ${log.message}`)
        if (log.metadata) {
          console.log(`   Metadata:`, JSON.stringify(log.metadata, null, 2))
        }
      })
    } else {
      console.log(`\n⚠️  No logs found for this post`)
    }

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

checkPostError()
