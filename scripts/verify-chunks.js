const { PrismaClient } = require('./prisma/generated/client');
const prisma = new PrismaClient();

async function verifyChunks() {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    include: {
      _count: { select: { chunks: true } },
      chunks: {
        select: {
          id: true,
          ordinal: true,
          content: true,
          tokens: true,
          vectorId: true
        },
        orderBy: { ordinal: 'asc' }
      }
    }
  });

  console.log('📊 Knowledge Base Status:\n');

  entries.forEach(entry => {
    console.log(`📄 ${entry.title}`);
    console.log(`   Status: ${entry.status}`);
    console.log(`   Chunks: ${entry._count.chunks}`);
    console.log(`   WorkspaceId: ${entry.workspaceId || 'NULL'}`);
    console.log('');

    if (entry.chunks.length > 0) {
      console.log('   Chunks details:');
      entry.chunks.forEach((chunk, i) => {
        console.log(`   ${i + 1}. Ordinal ${chunk.ordinal} | ${chunk.tokens || 0} tokens | Vector: ${chunk.vectorId}`);
        console.log(`      Content preview: ${chunk.content.substring(0, 100)}...`);
      });
    }
    console.log('─'.repeat(80));
  });

  await prisma.$disconnect();
}

verifyChunks();
