#!/usr/bin/env node

/**
 * Script to reindex knowledge base entries that have 0 chunks
 * Usage: node scripts/reindex-knowledge.js [--dry-run] [--all]
 */

const { PrismaClient } = require('../prisma/generated/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const reindexAll = args.includes('--all');

async function reindexKnowledge() {
  try {
    console.log('🔍 Scanning knowledge base entries...\n');

    // Find entries with issues
    const entries = await prisma.knowledgeBaseEntry.findMany({
      include: {
        _count: {
          select: { chunks: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const needsReindex = reindexAll
      ? entries
      : entries.filter(e => e._count.chunks === 0);

    console.log(`📊 Statistics:`);
    console.log(`   Total entries: ${entries.length}`);
    console.log(`   Entries with 0 chunks: ${entries.filter(e => e._count.chunks === 0).length}`);
    console.log(`   Entries to reindex: ${needsReindex.length}`);
    console.log('');

    if (needsReindex.length === 0) {
      console.log('✅ No entries need reindexing!');
      return;
    }

    if (isDryRun) {
      console.log('🏃 DRY RUN - Would reindex these entries:');
      console.log('─'.repeat(80));
      needsReindex.forEach((entry, i) => {
        console.log(`${i + 1}. ${entry.title}`);
        console.log(`   ID: ${entry.id}`);
        console.log(`   Status: ${entry.status}`);
        console.log(`   Chunks: ${entry._count.chunks}`);
        console.log('');
      });
      console.log('Run without --dry-run to actually reindex');
      return;
    }

    console.log('🔄 Reindexing entries...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const entry of needsReindex) {
      try {
        console.log(`Processing: ${entry.title}`);

        // Call reindex API
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/knowledge/${entry.id}/reindex`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          console.log(`   ✅ Success`);
          successCount++;
        } else {
          const error = await response.text();
          console.log(`   ❌ Failed: ${error}`);
          errorCount++;
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errorCount++;
      }

      console.log('');
    }

    console.log('─'.repeat(80));
    console.log(`\n📈 Reindex Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📊 Total: ${needsReindex.length}`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📚 Knowledge Base Reindexing Tool

Usage:
  node scripts/reindex-knowledge.js [options]

Options:
  --dry-run     Show what would be reindexed without actually doing it
  --all         Reindex ALL entries (not just those with 0 chunks)
  --help, -h    Show this help message

Examples:
  node scripts/reindex-knowledge.js --dry-run
  node scripts/reindex-knowledge.js
  node scripts/reindex-knowledge.js --all
  `);
  process.exit(0);
}

reindexKnowledge();
