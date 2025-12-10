#!/usr/bin/env node

/**
 * Direct database reindexing (bypasses API authentication)
 * Calls indexing functions directly
 */

const { PrismaClient } = require('../prisma/generated/client');
const { reindexEntry } = require('../src/lib/knowledge/indexer');

require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

async function reindexDirect() {
  try {
    console.log('🔍 Scanning knowledge base entries...\n');

    // Find entries with 0 chunks
    const entries = await prisma.knowledgeBaseEntry.findMany({
      include: {
        _count: {
          select: { chunks: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const needsReindex = entries.filter(e => e._count.chunks === 0);

    console.log(`📊 Statistics:`);
    console.log(`   Total entries: ${entries.length}`);
    console.log(`   Entries with 0 chunks: ${needsReindex.length}`);
    console.log('');

    if (needsReindex.length === 0) {
      console.log('✅ No entries need reindexing!');
      return;
    }

    console.log('🔄 Reindexing entries...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const entry of needsReindex) {
      try {
        console.log(`Processing: ${entry.title}`);
        console.log(`   Entry ID: ${entry.id}`);
        console.log(`   User ID: ${entry.userId || 'NULL'}`);
        console.log(`   Workspace ID: ${entry.workspaceId || 'NULL'}`);
        console.log(`   Project ID: ${entry.projectId || 'NULL'}`);

        // Build tenant key
        const tenant = {
          projectId: entry.projectId,
          userId: entry.userId || undefined,
          workspaceId: entry.workspaceId || undefined,
        };

        if (!tenant.projectId) {
          throw new Error('projectId ausente para reindexação');
        }

        // Call reindex function directly
        await reindexEntry(entry.id, tenant);

        console.log(`   ✅ Success - Entry reindexed`);
        successCount++;
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        console.error('   Full error:', error);
        errorCount++;
      }

      console.log('');
    }

    console.log('─'.repeat(80));
    console.log(`\n📈 Reindex Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📊 Total: ${needsReindex.length}\n`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

reindexDirect();
