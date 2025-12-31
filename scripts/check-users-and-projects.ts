/**
 * Check Users and Projects
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkUsersAndProjects() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 USERS AND PROJECTS CHECK')
    console.log('='.repeat(80) + '\n')

    // Get all users
    const users = await db.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
      }
    })

    console.log(`👥 USERS IN DATABASE (${users.length} total):`)
    console.log('='.repeat(80))
    users.forEach((user, i) => {
      console.log(`\n${i + 1}. ID: ${user.id}`)
      console.log(`   Clerk ID: ${user.clerkId || '❌ NOT SET'}`)
      console.log(`   Email: ${user.email}`)
      console.log(`   Name: ${user.name}`)
    })

    // Get Espeto Gaúcho project
    const project = await db.project.findFirst({
      where: {
        name: { equals: 'Espeto Gaúcho', mode: 'insensitive' }
      },
      select: {
        id: true,
        name: true,
        userId: true,
      }
    })

    if (project) {
      console.log(`\n\n📊 PROJECT "Espeto Gaúcho":`)
      console.log('='.repeat(80))
      console.log(`   ID: ${project.id}`)
      console.log(`   User ID: ${project.userId}`)

      // Check if userId matches any database user
      const userExists = users.find(u => u.id === project.userId)
      const clerkIdMatch = users.find(u => u.clerkId === project.userId)

      if (userExists) {
        console.log(`   ✅ User exists in database`)
      } else if (clerkIdMatch) {
        console.log(`   ⚠️  userId is a Clerk ID, not a database user ID!`)
        console.log(`   This is the problem - Project.userId should be the database user.id`)
        console.log(`   Not the clerkId!`)
        console.log(`\n   💡 FOUND MATCH:`)
        console.log(`      Database User ID: ${clerkIdMatch.id}`)
        console.log(`      Clerk ID: ${clerkIdMatch.clerkId}`)
        console.log(`      Should update Project.userId to: ${clerkIdMatch.id}`)
      } else {
        console.log(`   ❌ User NOT found in database`)
        console.log(`   The project references a user that doesn't exist`)
      }
    }

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

checkUsersAndProjects()
