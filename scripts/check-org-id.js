#!/usr/bin/env node

/**
 * Check current organization ID from Clerk and compare with database workspaceId
 */

const { PrismaClient } = require('../prisma/generated/client');
const prisma = new PrismaClient();

async function checkOrgId() {
  try {
    console.log('🔍 Checking knowledge base entries and workspaces...\n');

    // Get knowledge entries
    const entries = await prisma.knowledgeBaseEntry.findMany({
      select: {
        id: true,
        title: true,
        workspaceId: true,
        userId: true,
        status: true,
        _count: { select: { chunks: true } }
      }
    });

    console.log('📊 Knowledge Base Entries:');
    entries.forEach(entry => {
      console.log(`\n  📄 ${entry.title}`);
      console.log(`     Entry ID: ${entry.id}`);
      console.log(`     WorkspaceId (DB): ${entry.workspaceId || 'NULL'}`);
      console.log(`     UserId: ${entry.userId || 'NULL'}`);
      console.log(`     Status: ${entry.status}`);
      console.log(`     Chunks: ${entry._count.chunks}`);
    });

    // Get workspaces
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        clerkOrgId: true,
        createdAt: true,
      }
    });

    console.log('\n\n🏢 Workspaces in Database:');
    workspaces.forEach(workspace => {
      console.log(`\n  📁 ${workspace.name}`);
      console.log(`     DB ID: ${workspace.id}`);
      console.log(`     Clerk Org ID: ${workspace.clerkOrgId || 'NULL'}`);
      console.log(`     Created: ${workspace.createdAt}`);
    });

    // Get users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
      }
    });

    console.log('\n\n👥 Users in Database:');
    users.forEach(user => {
      console.log(`\n  👤 ${user.email || 'No email'}`);
      console.log(`     DB ID: ${user.id}`);
      console.log(`     Clerk ID: ${user.clerkId}`);
    });

    console.log('\n\n💡 Analysis:');
    console.log('   The /api/knowledge endpoint expects workspaceId to be the Clerk orgId');
    console.log('   Check if any workspace has a matching clerkOrgId');

    if (entries.length > 0 && workspaces.length > 0) {
      const entry = entries[0];
      const matchingWorkspace = workspaces.find(w => w.id === entry.workspaceId);

      if (matchingWorkspace) {
        console.log(`\n   ✅ Entry workspace found: ${matchingWorkspace.name}`);
        if (matchingWorkspace.clerkOrgId) {
          console.log(`   📝 Suggestion: Update entry workspaceId from "${entry.workspaceId}" to "${matchingWorkspace.clerkOrgId}"`);
        } else {
          console.log(`   ⚠️  Workspace has no clerkOrgId - needs to be set!`);
        }
      } else {
        console.log(`\n   ⚠️  Entry workspaceId "${entry.workspaceId}" does not match any workspace DB ID`);
      }
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkOrgId();
