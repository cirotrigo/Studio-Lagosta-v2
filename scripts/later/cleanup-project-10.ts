#!/usr/bin/env tsx

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { db } from '../../src/lib/db'
import { PostingProvider } from '../../prisma/generated/client'

async function cleanupProject10() {
  console.log('🧹 Limpando Projeto ID: 10...\n')

  const project = await db.project.findUnique({
    where: { id: 10 },
    select: {
      id: true,
      name: true,
      postingProvider: true,
      laterAccountId: true,
      laterProfileId: true,
      instagramUsername: true,
    },
  })

  if (!project) {
    console.log('❌ Projeto ID: 10 não encontrado')
    await db.$disconnect()
    return
  }

  console.log('📍 Projeto encontrado:')
  console.log(`   Nome: ${project.name}`)
  console.log(`   Provider: ${project.postingProvider || 'ZAPIER'}`)
  console.log(`   Instagram: ${project.instagramUsername || 'Não configurado'}`)
  console.log(`   Later Account: ${project.laterAccountId || 'Nenhum'}`)
  console.log()

  // Reverter para Zapier e limpar campos Later
  const updated = await db.project.update({
    where: { id: 10 },
    data: {
      postingProvider: PostingProvider.ZAPIER,
      laterAccountId: null,
      laterProfileId: null,
    },
  })

  console.log('✅ Projeto ID: 10 revertido para ZAPIER')
  console.log('   Later Account ID: removido')
  console.log('   Later Profile ID: removido')
  console.log('   Posting Provider: ZAPIER')
  console.log()
  console.log('💡 O projeto agora está limpo e não interfere com Later.')
  console.log('   (Projeto ID: 8 continua usando Later normalmente)')

  await db.$disconnect()
}

cleanupProject10()
