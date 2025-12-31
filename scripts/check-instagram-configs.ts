/**
 * Check Instagram Configurations for All Projects
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkInstagramConfigs() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 VERIFICANDO CONFIGURAÇÕES DE INSTAGRAM - TODOS OS PROJETOS')
    console.log('='.repeat(80) + '\n')

    const projects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        instagramAccountId: true,
        instagramUsername: true,
        laterAccountId: true,
        laterProfileId: true,
        postingProvider: true,
      },
      orderBy: { name: 'asc' }
    })

    console.log(`📊 Configuração de Instagram de cada projeto:\n`)

    projects.forEach((p, i) => {
      console.log(`${i + 1}. 📱 ${p.name} (ID: ${p.id})`)
      console.log(`   Provider: ${p.postingProvider || 'ZAPIER'}`)
      console.log(`   Instagram Username: ${p.instagramUsername || '❌ NÃO CONFIGURADO'}`)
      console.log(`   Instagram Account ID: ${p.instagramAccountId || '❌ NÃO CONFIGURADO'}`)
      console.log(`   Later Account ID: ${p.laterAccountId || '❌ NÃO CONFIGURADO'}`)
      console.log(`   Later Profile ID: ${p.laterProfileId || '❌ NÃO CONFIGURADO'}`)
      console.log()
    })

    console.log('='.repeat(80))

    // Check for duplicates in Later Account ID
    const laterAccountIds = projects
      .filter(p => p.laterAccountId)
      .map(p => ({ name: p.name, laterAccountId: p.laterAccountId }))

    const accountIdMap = new Map<string, string[]>()
    laterAccountIds.forEach(item => {
      const names = accountIdMap.get(item.laterAccountId!) || []
      names.push(item.name)
      accountIdMap.set(item.laterAccountId!, names)
    })

    const duplicateAccounts = Array.from(accountIdMap.entries()).filter(
      ([_, names]) => names.length > 1
    )

    if (duplicateAccounts.length > 0) {
      console.log('\n⚠️  PROBLEMA: Múltiplos projetos usando o MESMO Later Account ID!')
      console.log('    Isso faz com que posts de diferentes projetos sejam publicados')
      console.log('    na mesma conta do Instagram!\n')

      duplicateAccounts.forEach(([accountId, names]) => {
        console.log(`   Later Account ID: ${accountId}`)
        console.log(`   Projetos afetados:`)
        names.forEach(name => console.log(`     - ${name}`))
        console.log()
      })
    }

    // Check for duplicates in Later Profile ID
    const laterProfileIds = projects
      .filter(p => p.laterProfileId)
      .map(p => ({ name: p.name, laterProfileId: p.laterProfileId }))

    const profileIdMap = new Map<string, string[]>()
    laterProfileIds.forEach(item => {
      const names = profileIdMap.get(item.laterProfileId!) || []
      names.push(item.name)
      profileIdMap.set(item.laterProfileId!, names)
    })

    const duplicateProfiles = Array.from(profileIdMap.entries()).filter(
      ([_, names]) => names.length > 1
    )

    if (duplicateProfiles.length > 0) {
      console.log('\n⚠️  PROBLEMA: Múltiplos projetos usando o MESMO Later Profile ID!')
      console.log('    Cada projeto deve ter seu próprio Profile ID!\n')

      duplicateProfiles.forEach(([profileId, names]) => {
        console.log(`   Later Profile ID: ${profileId}`)
        console.log(`   Projetos afetados:`)
        names.forEach(name => console.log(`     - ${name}`))
        console.log()
      })
    }

    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

checkInstagramConfigs()
