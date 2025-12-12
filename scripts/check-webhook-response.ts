import { db } from '../src/lib/db';

async function checkWebhookResponse() {
  // Buscar os posts falhados do By Rock para ver o webhookResponse
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
      verificationStatus: 'VERIFICATION_FAILED',
    },
    orderBy: {
      scheduledDatetime: 'asc',
    },
    take: 2, // Apenas 2 posts para não lotar o console
  });

  console.log(`\n📋 Verificando webhook responses dos primeiros 2 posts:\n`);

  for (const post of posts) {
    console.log('═'.repeat(100));
    console.log(`📝 Post ID: ${post.id}`);
    console.log(`📅 Agendado: ${post.scheduledDatetime}`);
    console.log(`🏷️  TAG: ${post.verificationTag}`);
    console.log(`💬 Caption salvo: "${post.caption}"`);
    console.log(`\n📤 Webhook Response:`);
    console.log(JSON.stringify(post.webhookResponse, null, 2));
    console.log('\n');
  }
}

checkWebhookResponse()
  .catch(console.error)
  .finally(() => db.$disconnect());
