/**
 * List Projects and Their Posting Providers
 *
 * This script lists all projects and shows which posting provider they use.
 *
 * Usage:
 *   npx tsx scripts/later/list-projects.ts
 */

// Load environment variables from .env
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { PrismaClient } from '../../prisma/generated/client'

const db = new PrismaClient()

async function listProjects() {
  console.log('\n' + '='.repeat(80))
  console.log('📋 PROJECTS AND POSTING PROVIDERS')
  console.log('='.repeat(80) + '\n')

  try {
    const projects = await db.project.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        postingProvider: true,
        laterAccountId: true,
        laterProfileId: true,
        zapierWebhookUrl: true,
        instagramAccountId: true,
        instagramUsername: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    if (projects.length === 0) {
      console.log('No active projects found.')
      return
    }

    const laterProjects = projects.filter((p) => p.postingProvider === 'LATER')
    const zapierProjects = projects.filter(
      (p) => !p.postingProvider || p.postingProvider === 'ZAPIER'
    )

    console.log(`Total Projects: ${projects.length}`)
    console.log(`  • Later API: ${laterProjects.length}`)
    console.log(`  • Zapier/Buffer: ${zapierProjects.length}`)
    console.log('')

    // Later projects
    if (laterProjects.length > 0) {
      console.log('='.repeat(80))
      console.log('🚀 PROJECTS USING LATER API')
      console.log('='.repeat(80))

      laterProjects.forEach((project, index) => {
        console.log(`\n${index + 1}. ${project.name} (ID: ${project.id})`)
        console.log(`   Provider: ${project.postingProvider}`)
        console.log(`   Later Account ID: ${project.laterAccountId || 'NOT SET ⚠️'}`)
        console.log(`   Later Profile ID: ${project.laterProfileId || 'Not set'}`)
        console.log(`   Instagram: @${project.instagramUsername || 'Not configured ⚠️'}`)
      })

      console.log('')
    }

    // Zapier projects
    if (zapierProjects.length > 0) {
      console.log('='.repeat(80))
      console.log('📤 PROJECTS USING ZAPIER/BUFFER')
      console.log('='.repeat(80))

      zapierProjects.forEach((project, index) => {
        console.log(`\n${index + 1}. ${project.name} (ID: ${project.id})`)
        console.log(`   Provider: ${project.postingProvider || 'ZAPIER (default)'}`)
        console.log(
          `   Zapier Webhook: ${project.zapierWebhookUrl ? 'Configured' : 'Using global webhook'}`
        )
        console.log(`   Instagram: @${project.instagramUsername || 'Not configured ⚠️'}`)
      })

      console.log('')
    }

    console.log('='.repeat(80))
    console.log('💡 TIP: To configure a project for Later, run:')
    console.log('   npx tsx scripts/later/configure-project.ts "Project Name" acc_xxxxx')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

listProjects()
