/**
 * Configure Project for Later API
 *
 * This script configures a project to use Later API instead of Zapier/Buffer.
 *
 * Usage:
 *   npx tsx scripts/later/configure-project.ts "Project Name" acc_xxxxx prf_xxxxx
 *
 * Arguments:
 *   1. projectName - Name of the project to configure
 *   2. laterAccountId - Later account ID (from Later dashboard)
 *   3. laterProfileId - Later profile ID (optional)
 */

// Load environment variables from .env
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { PrismaClient, PostingProvider } from '../../prisma/generated/client'

const db = new PrismaClient()

async function configureProject(
  projectName: string,
  laterAccountId: string,
  laterProfileId?: string
) {
  console.log('\n' + '='.repeat(80))
  console.log('🔧 CONFIGURE PROJECT FOR LATER API')
  console.log('='.repeat(80))
  console.log(`📌 Project: ${projectName}`)
  console.log(`📌 Later Account ID: ${laterAccountId}`)
  console.log(`📌 Later Profile ID: ${laterProfileId || 'Not provided'}`)
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
        laterProfileId: true,
        instagramAccountId: true,
        instagramUsername: true,
      },
    })

    if (!project) {
      throw new Error(`Project "${projectName}" not found`)
    }

    console.log(`✅ Project found: ${project.name} (ID: ${project.id})`)
    console.log(`   Current provider: ${project.postingProvider || 'ZAPIER (default)'}`)
    console.log(`   Instagram account: ${project.instagramUsername || 'Not configured'}`)

    // Check Instagram configuration
    if (!project.instagramAccountId || !project.instagramUsername) {
      console.warn('\n⚠️  WARNING: Instagram account not configured for this project')
      console.warn('   Please configure Instagram account before using Later API')
    }

    // Update project configuration
    console.log(`\n📝 Updating project configuration...`)
    const updated = await db.project.update({
      where: { id: project.id },
      data: {
        laterAccountId,
        laterProfileId: laterProfileId || null,
        postingProvider: PostingProvider.LATER,
      },
      select: {
        id: true,
        name: true,
        postingProvider: true,
        laterAccountId: true,
        laterProfileId: true,
      },
    })

    console.log(`\n✅ Project configured successfully!`)
    console.log('='.repeat(80))
    console.log('📊 UPDATED CONFIGURATION:')
    console.log('='.repeat(80))
    console.log(`   Project ID: ${updated.id}`)
    console.log(`   Project Name: ${updated.name}`)
    console.log(`   Posting Provider: ${updated.postingProvider}`)
    console.log(`   Later Account ID: ${updated.laterAccountId}`)
    console.log(`   Later Profile ID: ${updated.laterProfileId || 'Not set'}`)
    console.log('='.repeat(80))

    console.log(`\n🎉 SUCCESS! Project "${updated.name}" is now configured to use Later API.`)
    console.log(`\n📝 Next steps:`)
    console.log(`   1. Create a test post via the UI or API`)
    console.log(`   2. Check logs for "[Dual-Mode Router] Using Later API"`)
    console.log(`   3. Verify post appears in Later dashboard`)
    console.log(`   4. Configure Later webhook: https://your-domain.com/api/webhooks/later`)
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

if (args.length < 2) {
  console.error('Usage: npx tsx scripts/later/configure-project.ts "Project Name" acc_xxxxx [prf_xxxxx]')
  console.error('\nArguments:')
  console.error('  1. projectName    - Name of the project to configure')
  console.error('  2. laterAccountId - Later account ID (required)')
  console.error('  3. laterProfileId - Later profile ID (optional)')
  console.error('\nExample:')
  console.error('  npx tsx scripts/later/configure-project.ts "Lagosta Criativa" acc_12345')
  process.exit(1)
}

const [projectName, laterAccountId, laterProfileId] = args

configureProject(projectName, laterAccountId, laterProfileId)
