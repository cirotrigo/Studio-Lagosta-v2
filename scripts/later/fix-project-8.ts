#!/usr/bin/env tsx

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { db } from '../../src/lib/db'
import { PostingProvider } from '../../prisma/generated/client'

async function fixProject8() {
  try {
    console.log('🔧 Fixing Project ID: 8 configuration...\n')

    const project = await db.project.findUnique({
      where: { id: 8 },
      select: {
        id: true,
        name: true,
        instagramUsername: true,
        laterAccountId: true,
        laterProfileId: true,
        postingProvider: true,
      },
    })

    if (!project) {
      console.error('❌ Project ID: 8 not found')
      return
    }

    console.log('📍 Current configuration:')
    console.log(`   Name: ${project.name}`)
    console.log(`   Instagram: @${project.instagramUsername}`)
    console.log(`   Provider: ${project.postingProvider || 'ZAPIER'}`)
    console.log(`   Later Account ID: ${project.laterAccountId || 'Not set'}`)
    console.log(`   Later Profile ID: ${project.laterProfileId || 'Not set'}`)
    console.log()

    // Update with correct Later IDs
    const updatedProject = await db.project.update({
      where: { id: 8 },
      data: {
        laterAccountId: '6951bef24207e06f4ca82e68',
        laterProfileId: '6950a7dfbf2041fa31e82829',
        postingProvider: PostingProvider.LATER,
      },
    })

    console.log('✅ Project updated successfully!\n')
    console.log('📍 New configuration:')
    console.log(`   Name: ${updatedProject.name}`)
    console.log(`   Provider: ${updatedProject.postingProvider}`)
    console.log(`   Later Account ID: ${updatedProject.laterAccountId}`)
    console.log(`   Later Profile ID: ${updatedProject.laterProfileId}`)
    console.log()
    console.log('🎉 Project ID: 8 is now ready to use Later API!')
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await db.$disconnect()
  }
}

fixProject8()
