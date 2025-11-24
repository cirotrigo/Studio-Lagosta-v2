#!/usr/bin/env node
/**
 * Script to validate Instagram User IDs for all projects
 *
 * This script:
 * 1. Fetches all projects with Instagram accounts
 * 2. Tests API access with configured IDs
 * 3. Reports which ID works (instagramAccountId vs instagramUserId)
 * 4. Suggests corrections if needed
 *
 * Usage:
 *   npm run validate-instagram-ids
 *
 * Environment:
 *   Requires INSTAGRAM_ACCESS_TOKEN to be set
 */

import { db } from '../lib/db'
import { InstagramGraphApiClient } from '../lib/instagram/graph-api-client'

type ValidationResult = {
  projectId: number
  projectName: string
  instagramUsername: string | null
  instagramAccountId: string | null
  instagramUserId: string | null
  accountIdWorks: boolean | null
  userIdWorks: boolean | null
  recommendedId: string | null
  needsUpdate: boolean
  error: string | null
}

async function validateProject(
  project: {
    id: number
    name: string
    instagramUsername: string | null
    instagramAccountId: string | null
    instagramUserId: string | null
  },
  client: InstagramGraphApiClient
): Promise<ValidationResult> {
  const result: ValidationResult = {
    projectId: project.id,
    projectName: project.name,
    instagramUsername: project.instagramUsername,
    instagramAccountId: project.instagramAccountId,
    instagramUserId: project.instagramUserId,
    accountIdWorks: null,
    userIdWorks: null,
    recommendedId: null,
    needsUpdate: false,
    error: null,
  }

  // Test instagramAccountId
  if (project.instagramAccountId) {
    try {
      await client.getStories(project.instagramAccountId)
      result.accountIdWorks = true
      result.recommendedId = project.instagramAccountId
    } catch (error) {
      result.accountIdWorks = false
    }
  }

  // Test instagramUserId
  if (project.instagramUserId && project.instagramUserId !== project.instagramAccountId) {
    try {
      await client.getStories(project.instagramUserId)
      result.userIdWorks = true
      if (!result.recommendedId) {
        result.recommendedId = project.instagramUserId
      }
    } catch (error) {
      result.userIdWorks = false
    }
  }

  // Determine if update is needed
  if (result.accountIdWorks === false && result.userIdWorks === true) {
    result.needsUpdate = true
  } else if (result.accountIdWorks === null && result.userIdWorks === null) {
    result.error = 'No Instagram IDs configured'
  } else if (result.accountIdWorks === false && result.userIdWorks === false) {
    result.error = 'Both IDs failed - token or permission issue'
  } else if (result.accountIdWorks === false && result.userIdWorks === null) {
    result.error = 'instagramAccountId failed and no instagramUserId to test'
    result.needsUpdate = true
  }

  return result
}

async function main() {
  console.log('🔍 Instagram ID Validation Script')
  console.log('==================================\n')

  // Check if token is set
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    console.error('❌ Error: INSTAGRAM_ACCESS_TOKEN not set in environment')
    process.exit(1)
  }

  console.log('✓ Instagram access token found\n')

  // Fetch all projects with Instagram
  const projects = await db.project.findMany({
    where: {
      OR: [{ instagramAccountId: { not: null } }, { instagramUserId: { not: null } }],
    },
    select: {
      id: true,
      name: true,
      instagramUsername: true,
      instagramAccountId: true,
      instagramUserId: true,
    },
    orderBy: {
      name: 'asc',
    },
  })

  console.log(`Found ${projects.length} project(s) with Instagram configured\n`)

  if (projects.length === 0) {
    console.log('No projects to validate. Exiting.')
    return
  }

  // Validate each project
  const client = new InstagramGraphApiClient()
  const results: ValidationResult[] = []

  for (const project of projects) {
    console.log(`Validating project: ${project.name} (${project.id})...`)
    const result = await validateProject(project, client)
    results.push(result)

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  console.log('\n📊 Validation Results')
  console.log('====================\n')

  // Summary
  const needsUpdate = results.filter((r) => r.needsUpdate)
  const hasErrors = results.filter((r) => r.error !== null)
  const allGood = results.filter((r) => !r.needsUpdate && !r.error)

  console.log(`✅ Working correctly: ${allGood.length}`)
  console.log(`⚠️  Needs update: ${needsUpdate.length}`)
  console.log(`❌ Has errors: ${hasErrors.length}\n`)

  // Detailed results
  if (needsUpdate.length > 0) {
    console.log('⚠️  Projects that need updates:')
    console.log('------------------------------')
    for (const result of needsUpdate) {
      console.log(`\nProject: ${result.projectName}`)
      console.log(`  ID: ${result.projectId}`)
      console.log(`  Username: @${result.instagramUsername || 'unknown'}`)
      console.log(`  instagramAccountId: ${result.instagramAccountId} (works: ${result.accountIdWorks})`)
      console.log(`  instagramUserId: ${result.instagramUserId} (works: ${result.userIdWorks})`)
      console.log(`  Recommended ID: ${result.recommendedId}`)
      if (result.error) {
        console.log(`  Error: ${result.error}`)
      }
    }
    console.log('')
  }

  if (hasErrors.length > 0) {
    console.log('❌ Projects with errors:')
    console.log('------------------------')
    for (const result of hasErrors.filter((r) => !r.needsUpdate)) {
      console.log(`\nProject: ${result.projectName}`)
      console.log(`  ID: ${result.projectId}`)
      console.log(`  Username: @${result.instagramUsername || 'unknown'}`)
      console.log(`  Error: ${result.error}`)
    }
    console.log('')
  }

  if (allGood.length > 0) {
    console.log('✅ Projects working correctly:')
    console.log('-----------------------------')
    for (const result of allGood) {
      console.log(`  ${result.projectName} (@${result.instagramUsername || 'unknown'})`)
    }
    console.log('')
  }

  // Update suggestions
  if (needsUpdate.length > 0) {
    console.log('\n💡 Recommended Actions:')
    console.log('======================')
    console.log('\n1. Update projects using admin endpoint:')
    console.log('   POST /api/admin/projects/[projectId]')
    console.log('   Body: { "instagramUserId": "correct_id" }\n')
    console.log('2. Or update directly in database:')
    for (const result of needsUpdate) {
      if (result.recommendedId) {
        console.log(
          `   UPDATE "Project" SET "instagramUserId" = '${result.recommendedId}' WHERE id = '${result.projectId}';`
        )
      }
    }
    console.log('')
  }

  // Exit code
  if (hasErrors.length > 0) {
    process.exit(1)
  }
}

main()
  .then(() => {
    console.log('✓ Validation complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
