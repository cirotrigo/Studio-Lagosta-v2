/**
 * Delete a project by ID
 * WARNING: This will delete all related data (templates, posts, generations, etc)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function deleteProject(projectId: number) {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🗑️  DELETE PROJECT')
    console.log('='.repeat(80))
    console.log(`📌 Project ID: ${projectId}`)
    console.log('='.repeat(80) + '\n')

    // Get project details first
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        _count: {
          select: {
            Template: true,
            Generation: true,
            SocialPost: true,
          }
        }
      }
    })

    if (!project) {
      console.log('❌ Project not found\n')
      return
    }

    console.log(`📋 Project: ${project.name}`)
    console.log(`📊 Status: ${project.status}`)
    console.log(`\n📊 Related Data:`)
    console.log(`   • Templates: ${project._count.Template}`)
    console.log(`   • Generations: ${project._count.Generation}`)
    console.log(`   • Posts: ${project._count.SocialPost}`)
    console.log('\n⚠️  WARNING: This will delete ALL related data!')

    // Delete the project (cascade will handle related records)
    await db.project.delete({
      where: { id: projectId }
    })

    console.log(`\n✅ Project "${project.name}" (ID: ${projectId}) deleted successfully!`)
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

// Get project ID from command line
const projectId = parseInt(process.argv[2], 10)

if (!projectId || isNaN(projectId)) {
  console.error('\nUsage: npx tsx scripts/delete-project.ts <PROJECT_ID>')
  console.error('\nExample: npx tsx scripts/delete-project.ts 10\n')
  process.exit(1)
}

deleteProject(projectId)
