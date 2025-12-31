/**
 * Create a test post to verify Late API is working
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient, PostType, ScheduleType, PostStatus, PublishType } from '../prisma/generated/client'

const db = new PrismaClient()

async function createTestPost() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🧪 CREATE TEST POST FOR LATE API')
    console.log('='.repeat(80) + '\n')

    // Find Espeto Gaúcho project
    const project = await db.project.findFirst({
      where: { name: { equals: 'Espeto Gaúcho', mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        userId: true,
        postingProvider: true,
        laterAccountId: true,
        laterProfileId: true
      }
    })

    if (!project) {
      console.log('❌ Project not found')
      return
    }

    console.log(`📊 Project: ${project.name}`)
    console.log(`   Provider: ${project.postingProvider}`)
    console.log(`   Later Account: ${project.laterAccountId}`)
    console.log(`   Later Profile: ${project.laterProfileId}`)

    // Schedule for 2 minutes from now
    const scheduledTime = new Date(Date.now() + 2 * 60 * 1000)

    console.log(`\n📅 Creating test post scheduled for: ${scheduledTime.toLocaleString('pt-BR')}`)
    console.log(`   (2 minutes from now)\n`)

    const testPost = await db.socialPost.create({
      data: {
        projectId: project.id,
        userId: project.userId,
        postType: PostType.POST,
        caption: '🧪 TESTE LATE API - Este é um post de teste para verificar se o Late está funcionando. Se você ver isso no Instagram, está tudo OK! 🎉',
        mediaUrls: ['https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc?w=1080&h=1080&fit=crop'],
        blobPathnames: [],
        altText: ['Imagem de teste'],
        firstComment: '',
        publishType: PublishType.DIRECT,
        scheduleType: ScheduleType.SCHEDULED,
        scheduledDatetime: scheduledTime,
        status: PostStatus.SCHEDULED,
      }
    })

    console.log('='.repeat(80))
    console.log('✅ TEST POST CREATED SUCCESSFULLY!')
    console.log('='.repeat(80))
    console.log(`   Post ID: ${testPost.id}`)
    console.log(`   Caption: ${testPost.caption}`)
    console.log(`   Scheduled For: ${testPost.scheduledDatetime?.toLocaleString('pt-BR')}`)
    console.log('='.repeat(80))
    console.log('\n⏰ NEXT STEPS:')
    console.log('   1. Wait 2 minutes for the cron job to process')
    console.log('   2. Check if post appears in Late dashboard: https://getlate.dev/dashboard')
    console.log('   3. Run: npx tsx scripts/later/check-recent-posts.ts "Espeto Gaúcho"')
    console.log('   4. Look for laterPostId in the test post\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

createTestPost()
