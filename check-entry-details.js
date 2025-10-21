const { PrismaClient } = require('./prisma/generated/client');
const prisma = new PrismaClient();

(async () => {
  const entry = await prisma.knowledgeBaseEntry.findFirst({
    where: { id: 'cmgzpldc80000jf04kwhwi0b8' }
  });

  console.log('\n📋 Entry Details:\n');
  console.log('ID:', entry.id);
  console.log('Title:', entry.title);
  console.log('UserID:', entry.userId);
  console.log('WorkspaceID:', entry.workspaceId);
  console.log('Status:', entry.status);
  console.log('');

  await prisma.$disconnect();
})();
