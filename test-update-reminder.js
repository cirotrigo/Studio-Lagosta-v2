const { PrismaClient } = require('./prisma/generated/client');
const prisma = new PrismaClient();

async function testUpdate() {
  // Buscar o post de teste
  const post = await prisma.socialPost.findFirst({
    where: {
      publishType: 'REMINDER',
      Project: {
        name: { contains: 'Lagosta', mode: 'insensitive' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (post === null) {
    console.log('❌ Post não encontrado');
    await prisma.$disconnect();
    return;
  }

  console.log('📌 Post encontrado:', post.id.substring(0, 12));
  console.log('🔔 reminderSentAt ANTES:', post.reminderSentAt || 'NULL');

  // Testar atualização manual
  try {
    const updated = await prisma.socialPost.update({
      where: { id: post.id },
      data: { reminderSentAt: new Date() }
    });

    console.log('✅ Atualização bem-sucedida!');
    console.log('🔔 reminderSentAt DEPOIS:', updated.reminderSentAt ? new Date(updated.reminderSentAt).toLocaleString('pt-BR') : 'NULL');
    console.log('');
    console.log('🟢 Agora o badge deve ficar VERDE no calendário!');
    console.log('   Recarregue a página para ver a mudança.');
  } catch (error) {
    console.error('❌ Erro ao atualizar:', error.message);
  }

  await prisma.$disconnect();
}

testUpdate().catch(console.error);
