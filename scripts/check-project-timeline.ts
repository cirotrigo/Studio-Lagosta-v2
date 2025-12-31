import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'
const db = new PrismaClient()

async function check() {
  const project = await db.project.findFirst({
    where: { name: { equals: 'Espeto Gaúcho', mode: 'insensitive' } },
    select: { id: true, name: true, postingProvider: true, updatedAt: true, createdAt: true }
  })

  if (project) {
    console.log('\n📊 Espeto Gaúcho - Histórico de Mudanças:')
    console.log(`   ID: ${project.id}`)
    console.log(`   Provider Atual: ${project.postingProvider}`)
    console.log(`   Criado: ${project.createdAt.toLocaleString('pt-BR')}`)
    console.log(`   Última atualização: ${project.updatedAt.toLocaleString('pt-BR')}`)
  }

  // Check posts timeline
  const posts = await db.socialPost.findMany({
    where: { projectId: 6 },
    select: { id: true, createdAt: true, sentAt: true, laterPostId: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  console.log('\n📬 Últimos 5 posts:')
  posts.forEach((p, i) => {
    console.log(`   ${i+1}. Criado: ${p.createdAt.toLocaleString('pt-BR')} | Via Late: ${p.laterPostId ? 'SIM ✅' : 'NÃO ❌'}`)
  })

  console.log('\n⏰ Timeline:')
  console.log(`   1. Posts criados: ${posts[posts.length-1]?.createdAt.toLocaleString('pt-BR')}`)
  console.log(`   2. Projeto atualizado (migração): ${project?.updatedAt.toLocaleString('pt-BR')}`)
  console.log('')

  await db.$disconnect()
}
check()
