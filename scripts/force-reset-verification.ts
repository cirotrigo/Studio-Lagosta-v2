import { db } from '../src/lib/db';

async function forceReset() {
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

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Buscar TODOS os posts que não estão verificados
  const posts = await db.socialPost.findMany({
    where: {
      projectId: project.id,
      createdAt: {
        gte: sevenDaysAgo,
      },
      postType: 'STORY',
      OR: [
        { verificationStatus: 'VERIFICATION_FAILED' },
        {
          verificationStatus: 'PENDING',
          verificationAttempts: {
            gt: 0,
          },
        },
      ],
    },
  });

  console.log(`📊 Posts para resetar: ${posts.length}\n`);

  if (posts.length === 0) {
    console.log('✅ Nenhum post para resetar');
    return;
  }

  // Resetar com data de verificação NO PASSADO (para processar imediatamente)
  const now = new Date();
  const pastVerification = new Date(now.getTime() - 5 * 60 * 1000); // -5 minutos

  const result = await db.socialPost.updateMany({
    where: {
      id: {
        in: posts.map((p) => p.id),
      },
    },
    data: {
      verificationStatus: 'PENDING',
      verificationAttempts: 0,
      nextVerificationAt: pastVerification,
      lastVerificationAt: null,
      verificationError: null,
      verifiedStoryId: null,
      verifiedPermalink: null,
      verifiedTimestamp: null,
      verifiedByFallback: false,
    },
  });

  console.log(`✅ ${result.count} posts resetados para PENDING`);
  console.log(`⏰ Data de verificação: ${pastVerification.toISOString()} (passado)`);
  console.log(`⏰ Hora atual: ${now.toISOString()}`);
  console.log(`\n📋 Posts resetados:`);

  for (const post of posts) {
    console.log(`  - ${post.id} (status anterior: ${post.verificationStatus})`);
  }
}

forceReset()
  .catch(console.error)
  .finally(() => db.$disconnect());
