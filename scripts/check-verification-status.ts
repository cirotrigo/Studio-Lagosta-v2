import { db } from '../src/lib/db';

async function checkStatus() {
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

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const posts = await db.socialPost.findMany({
    where: {
      projectId: project.id,
      createdAt: {
        gte: sevenDaysAgo,
      },
      postType: 'STORY',
    },
    orderBy: {
      nextVerificationAt: 'asc',
    },
  });

  console.log(`\n📊 Status de Verificação - Projeto ${project.name}\n`);
  console.log(`Hora atual: ${new Date().toISOString()}\n`);

  const grouped = posts.reduce((acc, post) => {
    const status = post.verificationStatus || 'NULL';
    if (!acc[status]) acc[status] = [];
    acc[status].push(post);
    return acc;
  }, {} as Record<string, typeof posts>);

  for (const [status, statusPosts] of Object.entries(grouped)) {
    console.log(`\n${status}: ${statusPosts.length} posts`);
    console.log('─'.repeat(80));

    for (const post of statusPosts) {
      const nextAt = post.nextVerificationAt
        ? new Date(post.nextVerificationAt).toISOString()
        : 'N/A';
      const isPast = post.nextVerificationAt && new Date(post.nextVerificationAt) <= new Date();

      console.log(`  ${post.id}`);
      console.log(`    Próxima verificação: ${nextAt} ${isPast ? '✅ (passado)' : '⏳ (futuro)'}`);
      console.log(`    Tentativas: ${post.verificationAttempts}`);
    }
  }
}

checkStatus()
  .catch(console.error)
  .finally(() => db.$disconnect());
