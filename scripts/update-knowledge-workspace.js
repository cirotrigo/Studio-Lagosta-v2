#!/usr/bin/env node

/**
 * Update workspaceId of knowledge base entries to match Clerk orgId
 * Usage: node scripts/update-knowledge-workspace.js <newOrgId>
 */

const { PrismaClient } = require('../prisma/generated/client');
const prisma = new PrismaClient();

async function updateWorkspaceId() {
  try {
    const newOrgId = process.argv[2];

    if (!newOrgId) {
      console.log('❌ Usage: node scripts/update-knowledge-workspace.js <clerkOrgId>');
      console.log('\n💡 To find your orgId:');
      console.log('   1. Log in to your app');
      console.log('   2. Open browser console');
      console.log('   3. Run: await fetch("/api/debug/org").then(r => r.json())');
      console.log('   4. Copy the orgId from the response\n');
      process.exit(1);
    }

    console.log(`🔄 Updating workspaceId to: ${newOrgId}\n`);

    // Get all knowledge entries
    const entries = await prisma.knowledgeBaseEntry.findMany({
      select: {
        id: true,
        title: true,
        workspaceId: true,
        _count: { select: { chunks: true } }
      }
    });

    console.log(`📊 Found ${entries.length} knowledge base entries:\n`);

    for (const entry of entries) {
      console.log(`  📄 ${entry.title}`);
      console.log(`     Current workspaceId: ${entry.workspaceId || 'NULL'}`);
      console.log(`     Chunks: ${entry._count.chunks}`);

      if (entry.workspaceId !== newOrgId) {
        await prisma.knowledgeBaseEntry.update({
          where: { id: entry.id },
          data: { workspaceId: newOrgId }
        });
        console.log(`     ✅ Updated to: ${newOrgId}\n`);
      } else {
        console.log(`     ⏭️  Already correct\n`);
      }
    }

    console.log('✅ All entries updated successfully!');
    console.log('\n💡 Now the entries should appear in /knowledge for your organization');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateWorkspaceId();
