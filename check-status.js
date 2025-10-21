const { PrismaClient } = require('./prisma/generated/client');
const prisma = new PrismaClient();

(async () => {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    include: {
      _count: { select: { chunks: true } }
    }
  });

  console.log('\n📊 Status da Base de Conhecimento:\n');
  entries.forEach(entry => {
    console.log(`✅ ${entry.title}`);
    console.log(`   Chunks: ${entry._count.chunks}`);
    console.log(`   Status: ${entry.status}`);
    console.log(`   WorkspaceId: ${entry.workspaceId || 'NULL'}`);
    console.log('');
  });

  await prisma.$disconnect();
})();
