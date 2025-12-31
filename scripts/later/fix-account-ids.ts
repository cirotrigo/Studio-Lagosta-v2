/**
 * Fix Later Account IDs
 * Adds the fixed Later Account ID to all projects using LATER provider
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { PrismaClient } from '../../prisma/generated/client'

const db = new PrismaClient()

const LATER_ACCOUNT_ID = '6951bef24207e06f4ca82e68' // Fixed account ID

async function fixAccountIds() {
  console.log('\n' + '='.repeat(80))
  console.log('🔧 FIX LATER ACCOUNT IDS')
  console.log('='.repeat(80))
  console.log(`📌 Fixed Account ID: ${LATER_ACCOUNT_ID}`)
  console.log('='.repeat(80) + '\n')

  try {
    // Find all projects using Later but without laterAccountId
    const projectsToFix = await db.project.findMany({
      where: {
        postingProvider: 'LATER',
        OR: [
          { laterAccountId: null },
          { laterAccountId: '' }
        ]
      },
      select: {
        id: true,
        name: true,
        laterProfileId: true,
        instagramUsername: true,
      }
    })

    if (projectsToFix.length === 0) {
      console.log('✅ All Later projects already have Account ID configured!')
      return
    }

    console.log(`🔍 Found ${projectsToFix.length} project(s) to fix:\n`)

    for (const project of projectsToFix) {
      console.log(`   • ${project.name} (ID: ${project.id})`)
      console.log(`     Instagram: ${project.instagramUsername || 'Not configured'}`)
      console.log(`     Profile ID: ${project.laterProfileId || 'Not configured'}`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('📝 Updating projects...')
    console.log('='.repeat(80) + '\n')

    let updated = 0

    for (const project of projectsToFix) {
      await db.project.update({
        where: { id: project.id },
        data: {
          laterAccountId: LATER_ACCOUNT_ID
        }
      })

      console.log(`✅ ${project.name} - Account ID configured`)
      updated++
    }

    console.log('\n' + '='.repeat(80))
    console.log(`🎉 SUCCESS! Updated ${updated} project(s)`)
    console.log('='.repeat(80))
    console.log('\n📊 All Later projects now have:')
    console.log(`   • Account ID: ${LATER_ACCOUNT_ID}`)
    console.log('   • Profile ID: Configured individually')
    console.log('')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

fixAccountIds()
