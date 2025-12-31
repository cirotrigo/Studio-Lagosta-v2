/**
 * Check User Clerk ID
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkUserClerkId() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 USER CLERK ID CHECK')
    console.log('='.repeat(80) + '\n')

    // Get post to find the userId
    const post = await db.socialPost.findUnique({
      where: { id: 'cmjud68ic0001sw7raqnx8h2i' },
      select: { userId: true }
    })

    if (!post) {
      console.log('❌ Post not found\n')
      return
    }

    console.log(`📋 Post User ID: ${post.userId}`)

    // Get user details
    const user = await db.user.findUnique({
      where: { id: post.userId },
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
        createdAt: true,
      }
    })

    if (!user) {
      console.log(`\n❌ User not found in database!`)
      console.log(`   User ID: ${post.userId}`)
      console.log(`\n💡 This is the problem - the post references a user that doesn't exist.`)
      return
    }

    console.log(`\n✅ User found:`)
    console.log(`   ID: ${user.id}`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Created: ${user.createdAt.toLocaleString('pt-BR')}`)
    console.log(`   Clerk ID: ${user.clerkId || '❌ NOT SET'}`)

    if (!user.clerkId) {
      console.log(`\n❌ PROBLEM FOUND: User exists but has no Clerk ID!`)
      console.log(`   This is why the Later API call fails.`)
      console.log(`\n💡 SOLUTION: The user needs a Clerk ID to use the Late API.`)
    } else {
      console.log(`\n✅ User has valid Clerk ID`)
    }

    // Check project ownership
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

    console.log(`\n📊 Project "Espeto Gaúcho":`)
    console.log(`   ID: ${project?.id}`)
    console.log(`   Owner User ID: ${project?.userId}`)
    console.log(`   Matches Post User: ${project?.userId === post.userId ? '✅ YES' : '❌ NO'}`)

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

checkUserClerkId()
