/**
 * Fix Project User IDs
 * Updates projects that have Clerk IDs in userId field instead of database user IDs
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function fixProjectUserIds() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔧 FIX PROJECT USER IDS')
    console.log('='.repeat(80) + '\n')

    // Get all users with their Clerk IDs
    const users = await db.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
      }
    })

    console.log(`👥 Found ${users.length} users in database\n`)

    // Get all projects
    const projects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        userId: true,
      }
    })

    console.log(`📊 Found ${projects.length} projects\n`)

    let fixed = 0
    let alreadyCorrect = 0
    let notFound = 0

    for (const project of projects) {
      // Check if userId is a database user ID (correct)
      const isCorrect = users.find(u => u.id === project.userId)

      if (isCorrect) {
        alreadyCorrect++
        console.log(`✅ ${project.name} (ID: ${project.id}) - Already correct`)
        continue
      }

      // Check if userId is a Clerk ID (wrong)
      const matchingUser = users.find(u => u.clerkId === project.userId)

      if (matchingUser) {
        console.log(`\n🔧 FIXING: ${project.name} (ID: ${project.id})`)
        console.log(`   Current userId: ${project.userId} (Clerk ID - WRONG)`)
        console.log(`   New userId: ${matchingUser.id} (Database ID - CORRECT)`)
        console.log(`   User: ${matchingUser.name || matchingUser.email || 'Unknown'}`)

        await db.project.update({
          where: { id: project.id },
          data: { userId: matchingUser.id }
        })

        console.log(`   ✅ Fixed!`)
        fixed++
      } else {
        console.log(`⚠️  ${project.name} (ID: ${project.id}) - User not found: ${project.userId}`)
        notFound++
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY:')
    console.log('='.repeat(80))
    console.log(`   ✅ Already correct: ${alreadyCorrect}`)
    console.log(`   🔧 Fixed: ${fixed}`)
    console.log(`   ⚠️  Not found: ${notFound}`)
    console.log('='.repeat(80) + '\n')

    if (fixed > 0) {
      console.log(`🎉 Successfully fixed ${fixed} project(s)!`)
      console.log(`   Posts should now work with the Late API.\n`)
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

fixProjectUserIds()
