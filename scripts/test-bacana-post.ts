/**
 * Test Bacana Post
 * Create a test post for Bacana to verify it posts to the correct Instagram account
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient, PostType, ScheduleType, PostStatus, PublishType } from '../prisma/generated/client'

const db = new PrismaClient()

async function testBacanaPost() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🧪 CRIAR POST DE TESTE - BACANA')
    console.log('='.repeat(80) + '\n')

    // Get Bacana project
    const bacana = await db.project.findFirst({
      where: { name: 'Bacana' },
      select: {
        id: true,
        name: true,
        userId: true,
        instagramUsername: true,
        laterProfileId: true,
        postingProvider: true,
      }
    })

    if (!bacana) {
      console.log('❌ Projeto Bacana não encontrado!\n')
      return
    }

    console.log(`📊 Projeto: ${bacana.name}`)
    console.log(`   Instagram: @${bacana.instagramUsername}`)
    console.log(`   Provider: ${bacana.postingProvider}`)
    console.log(`   Later Profile ID: ${bacana.laterProfileId}`)

    if (!bacana.laterProfileId) {
      console.log('\n❌ Later Profile ID não configurado!\n')
      return
    }

    // Create test post scheduled for 2 minutes from now
    const now = new Date()
    const scheduledTime = new Date(now.getTime() + 2 * 60 * 1000)

    console.log(`\n📅 Criando post de teste agendado para: ${scheduledTime.toLocaleString('pt-BR')}`)
    console.log(`   (2 minutos a partir de agora)\n`)

    const testPost = await db.socialPost.create({
      data: {
        projectId: bacana.id,
        userId: bacana.userId,
        postType: PostType.POST,
        caption: '🧪 TESTE BACANA - Verificando se está postando na conta CORRETA do @bacanabar! Se você vê isso aqui, o bug foi corrigido! 🎉',
        mediaUrls: ['https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1080&h=1080&fit=crop'], // Bar image
        scheduleType: ScheduleType.SCHEDULED,
        scheduledDatetime: scheduledTime,
        status: PostStatus.SCHEDULED,
        publishType: PublishType.DIRECT,
      }
    })

    console.log('='.repeat(80))
    console.log('✅ POST DE TESTE CRIADO COM SUCESSO!')
    console.log('='.repeat(80))
    console.log(`   Post ID: ${testPost.id}`)
    console.log(`   Caption: ${testPost.caption}`)
    console.log(`   Agendado para: ${testPost.scheduledDatetime?.toLocaleString('pt-BR')}`)
    console.log('='.repeat(80))

    console.log('\n⏰ PRÓXIMOS PASSOS:')
    console.log('   1. Aguarde 2 minutos para o cron job processar')
    console.log('   2. Verifique se o post apareceu no Instagram do @bacanabar')
    console.log('   3. Se aparecer no @bacanabar, o bug foi corrigido! ✅')
    console.log('   4. Se aparecer em outra conta, ainda há problema ❌\n')

    console.log('💡 Para executar manualmente agora:')
    console.log('   npx tsx scripts/manual-execute-post.ts\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

testBacanaPost()
