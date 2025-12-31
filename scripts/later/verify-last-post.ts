#!/usr/bin/env tsx

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { db } from '../../src/lib/db'

async function verifyLastPost() {
  try {
    console.log('🔍 Buscando último post criado...\n')

    const lastPost = await db.socialPost.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        Project: {
          select: {
            id: true,
            name: true,
            postingProvider: true,
            laterAccountId: true,
            laterProfileId: true,
          },
        },
      },
    })

    if (!lastPost) {
      console.log('❌ Nenhum post encontrado')
      return
    }

    console.log('📝 Último Post Criado:')
    console.log('━'.repeat(60))
    console.log(`ID: ${lastPost.id}`)
    console.log(`Projeto: ${lastPost.Project.name} (ID: ${lastPost.Project.id})`)
    console.log(`Provider: ${lastPost.Project.postingProvider || 'ZAPIER'}`)
    console.log(`Tipo: ${lastPost.postType}`)
    console.log(`Status: ${lastPost.status}`)
    console.log(`Caption: ${lastPost.caption?.substring(0, 50)}...`)
    console.log(`Criado em: ${lastPost.createdAt.toISOString()}`)
    console.log('━'.repeat(60))

    if (lastPost.Project.postingProvider === 'LATER') {
      console.log('\n✅ POST USANDO LATER API!')
      console.log(`Later Account ID: ${lastPost.Project.laterAccountId}`)
      console.log(`Later Profile ID: ${lastPost.Project.laterProfileId}`)
      console.log(`Later Post ID: ${lastPost.laterPostId || '(ainda não recebido)'}`)

      if (lastPost.laterPostId) {
        console.log('\n🎉 SUCESSO! Post foi criado no Later com ID:', lastPost.laterPostId)
      } else {
        console.log('\n⏳ Post criado mas Later Post ID ainda não recebido (verifique logs)')
      }
    } else {
      console.log('\n⚠️  POST USANDO ZAPIER/BUFFER')
      console.log('Este post NÃO foi enviado via Later API')
    }

    // Buscar logs relacionados
    console.log('\n📋 Logs relacionados:')
    console.log('━'.repeat(60))

    const logs = await db.postLog.findMany({
      where: { postId: lastPost.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    if (logs.length === 0) {
      console.log('(nenhum log encontrado)')
    } else {
      for (const log of logs) {
        const timestamp = log.createdAt.toISOString().split('T')[1].split('.')[0]
        console.log(`[${timestamp}] ${log.event}: ${log.message}`)
        if (log.metadata && typeof log.metadata === 'object' && 'error' in log.metadata) {
          console.log(`  ❌ Error: ${JSON.stringify(log.metadata.error)}`)
        }
      }
    }

  } catch (error) {
    console.error('❌ Erro ao verificar post:', error)
  } finally {
    await db.$disconnect()
  }
}

verifyLastPost()
