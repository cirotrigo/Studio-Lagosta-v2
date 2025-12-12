import { db } from '../src/lib/db';

async function checkCaptions() {
  // Buscar os posts falhados do By Rock
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
  });

  console.log(`\n📋 Verificando captions dos ${posts.length} posts com falha:\n`);

  for (const post of posts) {
    console.log('═'.repeat(100));
    console.log(`📝 Post ID: ${post.id}`);
    console.log(`📅 Agendado: ${post.scheduledDatetime}`);
    console.log(`🏷️  TAG esperada: ${post.verificationTag}`);
    console.log(`❌ Erro: ${post.verificationError}`);
    console.log(`\n💬 Caption completo:`);
    console.log('─'.repeat(100));
    console.log(post.caption);
    console.log('─'.repeat(100));

    // Verificar se a TAG está presente no caption
    if (post.verificationTag) {
      const tagPresent = post.caption.includes(post.verificationTag);
      console.log(`\n✅ TAG presente no caption: ${tagPresent ? 'SIM ✓' : 'NÃO ✗'}`);

      if (!tagPresent) {
        console.log('⚠️  PROBLEMA: A TAG não foi adicionada ao caption!');
      }
    }
    console.log('\n');
  }
}

checkCaptions()
  .catch(console.error)
  .finally(() => db.$disconnect());
