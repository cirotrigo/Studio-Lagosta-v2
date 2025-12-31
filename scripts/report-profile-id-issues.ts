/**
 * Report Later Profile ID Issues
 * Identifies projects with missing or duplicate Profile IDs
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function reportProfileIdIssues() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('📊 RELATÓRIO: LATER PROFILE ID - PROBLEMAS E SOLUÇÕES')
    console.log('='.repeat(80) + '\n')

    const projects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        instagramUsername: true,
        laterAccountId: true,
        laterProfileId: true,
        postingProvider: true,
      },
      orderBy: { name: 'asc' }
    })

    // Group by Profile ID
    const profileIdMap = new Map<string, typeof projects>()
    projects.forEach(p => {
      if (p.laterProfileId) {
        const existing = profileIdMap.get(p.laterProfileId) || []
        existing.push(p)
        profileIdMap.set(p.laterProfileId, existing)
      }
    })

    console.log('🔍 ANÁLISE DE PROFILE IDs:\n')

    // Show duplicates
    const duplicates: string[] = []
    profileIdMap.forEach((projs, profileId) => {
      if (projs.length > 1) {
        duplicates.push(profileId)
        console.log(`❌ DUPLICADO: Profile ID ${profileId}`)
        console.log(`   Usado por ${projs.length} projetos:`)
        projs.forEach(p => {
          console.log(`     - ${p.name} (@${p.instagramUsername})`)
        })
        console.log()
      }
    })

    if (duplicates.length === 0) {
      console.log('✅ Nenhum Profile ID duplicado encontrado!\n')
    }

    console.log('='.repeat(80))
    console.log('📋 LISTA COMPLETA DE PROJETOS E SEUS PROFILE IDs:\n')

    projects.forEach((p, i) => {
      const isDuplicate = p.laterProfileId && duplicates.includes(p.laterProfileId)
      const icon = isDuplicate ? '❌' : '✅'

      console.log(`${i + 1}. ${icon} ${p.name}`)
      console.log(`   Instagram: @${p.instagramUsername}`)
      console.log(`   Provider: ${p.postingProvider}`)
      console.log(`   Later Profile ID: ${p.laterProfileId || '⚠️  NÃO CONFIGURADO'}`)

      if (isDuplicate) {
        console.log(`   ⚠️  PROBLEMA: Profile ID compartilhado com outros projetos!`)
      }
      console.log()
    })

    console.log('='.repeat(80))
    console.log('💡 INSTRUÇÕES PARA CORREÇÃO:\n')

    if (duplicates.length > 0) {
      console.log('1️⃣  Acesse o painel do Later: https://getlate.dev/dashboard')
      console.log('2️⃣  Conecte cada conta do Instagram separadamente')
      console.log('3️⃣  Para cada conta conectada, copie o Profile ID')
      console.log('4️⃣  Configure cada projeto com seu próprio Profile ID único\n')

      console.log('📝 Projetos que precisam de Profile IDs únicos:\n')

      const problemProjects = projects.filter(p =>
        p.laterProfileId && duplicates.includes(p.laterProfileId)
      )

      problemProjects.forEach(p => {
        console.log(`   ▪ ${p.name} (@${p.instagramUsername})`)
        console.log(`     Atual Profile ID: ${p.laterProfileId}`)
        console.log(`     Precisa: Novo Profile ID único dessa conta\n`)
      })
    }

    console.log('='.repeat(80))

    // Count issues
    const totalDuplicates = projects.filter(p =>
      p.laterProfileId && duplicates.includes(p.laterProfileId)
    ).length

    console.log('\n📊 RESUMO:')
    console.log(`   Total de projetos: ${projects.length}`)
    console.log(`   Profile IDs duplicados: ${duplicates.length}`)
    console.log(`   Projetos afetados: ${totalDuplicates}`)
    console.log(`   Status: ${duplicates.length === 0 ? '✅ OK' : '❌ NECESSITA CORREÇÃO'}`)
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

reportProfileIdIssues()
