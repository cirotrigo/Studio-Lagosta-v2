import { db } from '../src/lib/db';

async function resetVerification() {
  // Buscar o projeto By Rock
  const project = await db.project.findFirst({
    where: {
      name: {
        contains: 'Rock',
        mode: 'insensitive',
      },
    },
  });

  if (!project) {
    console.log('❌ Projeto By Rock não encontrado');
    return;
  }

  console.log(`✅ Projeto encontrado: ${project.name} (ID: ${project.id})\n`);

  // Buscar posts com VERIFICATION_FAILED dos últimos 7 dias
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const posts = await db.socialPost.findMany({
    where: {
      projectId: project.id,
      createdAt: {
        gte: sevenDaysAgo,
      },
      postType: 'STORY',
      verificationStatus: 'VERIFICATION_FAILED',
    },
  });

  console.log(`📊 Posts com VERIFICATION_FAILED: ${posts.length}\n`);

  if (posts.length === 0) {
    console.log('✅ Nenhum post para resetar');
    return;
  }

  // Resetar para PENDING com verificação imediata
  const now = new Date();
  const nextVerification = new Date(now.getTime() + 1 * 60 * 1000); // +1 minuto

  const result = await db.socialPost.updateMany({
    where: {
      id: {
        in: posts.map((p) => p.id),
      },
    },
    data: {
      verificationStatus: 'PENDING',
      verificationAttempts: 0,
      nextVerificationAt: nextVerification,
      lastVerificationAt: null,
      verificationError: null,
      verifiedStoryId: null,
      verifiedPermalink: null,
      verifiedTimestamp: null,
      verifiedByFallback: false,
    },
  });

  console.log(`✅ ${result.count} posts resetados para PENDING`);
  console.log(`⏰ Próxima verificação agendada para: ${nextVerification.toISOString()}`);
  console.log(`\n📋 Posts resetados:`);

  for (const post of posts) {
    console.log(`  - ${post.id} (agendado: ${post.scheduledDatetime})`);
  }

  console.log(`\n💡 Execute o cron de verificação para re-verificar:`);
  console.log(`   curl -X POST http://localhost:3000/api/cron/verify-stories \\`);
  console.log(`     -H "Authorization: Bearer \${CRON_SECRET}"`);
}

resetVerification()
  .catch(console.error)
  .finally(() => db.$disconnect());
