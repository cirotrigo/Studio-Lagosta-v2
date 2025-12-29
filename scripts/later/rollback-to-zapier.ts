/**
 * Rollback Project to Zapier/Buffer
 *
 * This script reverts a project to use Zapier/Buffer instead of Later API.
 *
 * Usage:
 *   npx tsx scripts/later/rollback-to-zapier.ts "Project Name"
 *
 * Or rollback ALL projects:
 *   npx tsx scripts/later/rollback-to-zapier.ts --all
 */

// Load environment variables from .env
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { PrismaClient, PostingProvider } from '../../prisma/generated/client'

const db = new PrismaClient()

async function rollbackProject(projectName: string) {
  console.log('\n' + '='.repeat(80))
  console.log('🔄 ROLLBACK PROJECT TO ZAPIER/BUFFER')
  console.log('='.repeat(80))
  console.log(`📌 Project: ${projectName}`)
  console.log('='.repeat(80) + '\n')

  try {
    // Find project
    console.log(`🔍 Finding project "${projectName}"...`)
    const project = await db.project.findFirst({
      where: {
        name: {
          equals: projectName,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        postingProvider: true,
        laterAccountId: true,
        zapierWebhookUrl: true,
      },
    })

    if (!project) {
      throw new Error(`Project "${projectName}" not found`)
    }

    console.log(`✅ Project found: ${project.name} (ID: ${project.id})`)
    console.log(`   Current provider: ${project.postingProvider || 'ZAPIER (default)'}`)

    if (project.postingProvider !== PostingProvider.LATER) {
      console.log(`\n⚠️  Project is already using ${project.postingProvider || 'ZAPIER'}`)
      console.log('   No rollback needed.')
      return
    }

    // Rollback to Zapier
    console.log(`\n📝 Rolling back to Zapier/Buffer...`)
    const updated = await db.project.update({
      where: { id: project.id },
      data: {
        postingProvider: PostingProvider.ZAPIER,
      },
      select: {
        id: true,
        name: true,
        postingProvider: true,
        laterAccountId: true,
        zapierWebhookUrl: true,
      },
    })

    console.log(`\n✅ Rollback successful!`)
    console.log('='.repeat(80))
    console.log('📊 UPDATED CONFIGURATION:')
    console.log('='.repeat(80))
    console.log(`   Project ID: ${updated.id}`)
    console.log(`   Project Name: ${updated.name}`)
    console.log(`   Posting Provider: ${updated.postingProvider}`)
    console.log(`   Zapier Webhook: ${updated.zapierWebhookUrl || 'Using global webhook'}`)
    console.log('='.repeat(80))

    console.log(`\n🎉 SUCCESS! Project "${updated.name}" is now using Zapier/Buffer again.`)
    console.log(`\n📝 Note: Later configuration (laterAccountId) was preserved for future use.`)
    console.log('')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

async function rollbackAll() {
  console.log('\n' + '='.repeat(80))
  console.log('🔄 ROLLBACK ALL PROJECTS TO ZAPIER/BUFFER')
  console.log('='.repeat(80) + '\n')

  try {
    console.log('🔍 Finding projects using Later API...')
    const laterProjects = await db.project.findMany({
      where: {
        postingProvider: PostingProvider.LATER,
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (laterProjects.length === 0) {
      console.log('✅ No projects using Later API found.')
      return
    }

    console.log(`Found ${laterProjects.length} project(s) using Later API:\n`)
    laterProjects.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (ID: ${p.id})`)
    })

    console.log(`\n📝 Rolling back all ${laterProjects.length} projects...`)

    const result = await db.project.updateMany({
      where: {
        postingProvider: PostingProvider.LATER,
      },
      data: {
        postingProvider: PostingProvider.ZAPIER,
      },
    })

    console.log(`\n✅ Rollback successful!`)
    console.log(`   ${result.count} project(s) reverted to Zapier/Buffer`)
    console.log('')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage:')
  console.error('  Rollback single project:')
  console.error('    npx tsx scripts/later/rollback-to-zapier.ts "Project Name"')
  console.error('\n  Rollback all projects:')
  console.error('    npx tsx scripts/later/rollback-to-zapier.ts --all')
  process.exit(1)
}

const [firstArg] = args

if (firstArg === '--all') {
  rollbackAll()
} else {
  rollbackProject(firstArg)
}
