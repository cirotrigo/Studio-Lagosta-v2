#!/usr/bin/env tsx

/**
 * Force reindex ALL knowledge base entries
 * Used to update vector metadata (e.g., after changing workspaceId)
 */

// Load environment variables FIRST
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

import { PrismaClient } from '../prisma/generated/client'
import { reindexEntry } from '../src/lib/knowledge/indexer'

const prisma = new PrismaClient()

async function forceReindex() {
  try {
    console.log('🔍 Scanning ALL knowledge base entries...\n')

    const entries = await prisma.knowledgeBaseEntry.findMany({
      include: {
        _count: {
          select: { chunks: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log(`📊 Statistics:`)
    console.log(`   Total entries: ${entries.length}`)
    console.log('')

    if (entries.length === 0) {
      console.log('✅ No entries found!')
      return
    }

    console.log('🔄 Reindexing ALL entries (forced)...\n')

    let successCount = 0
    let errorCount = 0

    for (const entry of entries) {
      try {
        console.log(`Processing: ${entry.title}`)
        console.log(`   Entry ID: ${entry.id}`)
        console.log(`   User ID: ${entry.userId || 'NULL'}`)
        console.log(`   Workspace ID: ${entry.workspaceId || 'NULL'}`)
        console.log(`   Project ID: ${entry.projectId || 'NULL'}`)
        console.log(`   Current chunks: ${entry._count.chunks}`)

        // Build tenant key
        const tenant = {
          projectId: entry.projectId,
          userId: entry.userId || undefined,
          workspaceId: entry.workspaceId || undefined,
        }

        if (!tenant.projectId) {
          throw new Error('projectId ausente para reindexação')
        }

        // Call reindex function directly (will delete old chunks and create new ones)
        await reindexEntry(entry.id, tenant)

        console.log(`   ✅ Success - Entry reindexed`)
        successCount++
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        console.error('   Full error:', error)
        errorCount++
      }

      console.log('')
    }

    console.log('─'.repeat(80))
    console.log(`\n📈 Reindex Summary:`)
    console.log(`   ✅ Successful: ${successCount}`)
    console.log(`   ❌ Failed: ${errorCount}`)
    console.log(`   📊 Total: ${entries.length}\n`)

  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

forceReindex()
