/**
 * Fix Later Account IDs for All Projects
 * Updates each project with the correct Later Account ID from the API
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'
import { getLaterClient } from '../src/lib/later/client'

const db = new PrismaClient()

// Mapping of Instagram usernames to Later Account IDs (from Later API)
const LATER_ACCOUNT_MAPPING: Record<string, string> = {
  'lagostacriativa': '6951bef24207e06f4ca82e68',
  'by.rock': '69555cd34207e06f4ca8357a',
  'espetogauchoes': '69555d1d4207e06f4ca8357b',
  'oquintalparrillabar': '695562314207e06f4ca83580',
  '@oquintalparrillabar': '695562314207e06f4ca83580', // Handle @ prefix
  'terobrasaevinho': '695562e04207e06f4ca83581',
  '@terobrasaevinho': '695562e04207e06f4ca83581',
  'seuquinto': '695565314207e06f4ca83582',
  '@seuquinto': '695565314207e06f4ca83582',
  'realgelateriaoficial': '6955658f4207e06f4ca83583',
  'bacanabar': '695566904207e06f4ca83584',
  'cirotrigo': '695566ed4207e06f4ca83585',
}

async function fixLaterAccountIds() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔧 CORRIGIR LATER ACCOUNT IDs - TODOS OS PROJETOS')
    console.log('='.repeat(80) + '\n')

    const projects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        instagramUsername: true,
        laterAccountId: true,
        postingProvider: true,
      },
      where: {
        postingProvider: 'LATER'
      }
    })

    console.log(`📊 Encontrados ${projects.length} projetos usando LATER\n`)

    let fixed = 0
    let notFound = 0
    let alreadyCorrect = 0

    for (const project of projects) {
      const username = project.instagramUsername?.replace('@', '').toLowerCase()

      if (!username) {
        console.log(`⚠️  ${project.name} - Instagram username não configurado`)
        notFound++
        continue
      }

      const correctAccountId = LATER_ACCOUNT_MAPPING[username]

      if (!correctAccountId) {
        console.log(`⚠️  ${project.name} (@${username}) - Account ID não encontrado no mapeamento`)
        notFound++
        continue
      }

      if (project.laterAccountId === correctAccountId) {
        console.log(`✅ ${project.name} (@${username}) - Já está correto`)
        alreadyCorrect++
        continue
      }

      console.log(`\n🔧 ATUALIZANDO: ${project.name}`)
      console.log(`   Instagram: @${username}`)
      console.log(`   Atual Account ID: ${project.laterAccountId || 'Não configurado'}`)
      console.log(`   Novo Account ID:  ${correctAccountId}`)

      await db.project.update({
        where: { id: project.id },
        data: { laterAccountId: correctAccountId }
      })

      console.log(`   ✅ Atualizado!`)
      fixed++
    }

    console.log('\n' + '='.repeat(80))
    console.log('📊 RESUMO:')
    console.log('='.repeat(80))
    console.log(`   ✅ Já corretos: ${alreadyCorrect}`)
    console.log(`   🔧 Corrigidos: ${fixed}`)
    console.log(`   ⚠️  Não encontrados: ${notFound}`)
    console.log('='.repeat(80) + '\n')

    if (fixed > 0) {
      console.log(`🎉 ${fixed} projeto(s) corrigido(s) com sucesso!`)
      console.log(`   Agora cada projeto vai postar na conta correta do Instagram.\n`)
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

fixLaterAccountIds()
