import { db } from '../src/lib/db';

async function checkByRockPosts() {
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

  console.log(`✅ Projeto encontrado: ${project.name} (ID: ${project.id})`);

  // Buscar postagens dos últimos 7 dias com falha na verificação
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

  console.log(`\n📊 Total de posts de stories com VERIFICATION_FAILED (últimos 7 dias): ${posts.length}\n`);

  for (const post of posts) {
    console.log('─'.repeat(80));
    console.log(`📝 Post ID: ${post.id}`);
    console.log(`📅 Agendado para: ${post.scheduledDatetime}`);
    console.log(`🏷️  TAG: ${post.verificationTag || 'SEM TAG'}`);
    console.log(`✅ Status da Postagem: ${post.status}`);
    console.log(`🔍 Status de Verificação: ${post.verificationStatus || 'N/A'}`);
    console.log(`🔄 Tentativas: ${post.verificationAttempts || 0}`);
    console.log(`📤 Enviado em (Buffer): ${post.bufferSentAt || 'N/A'}`);
    console.log(`📥 Enviado em (sentAt): ${post.sentAt || 'N/A'}`);
    console.log(`🆔 Story ID verificado: ${post.verifiedStoryId || 'N/A'}`);
    console.log(`🔁 Verificado por fallback: ${post.verifiedByFallback ? 'SIM' : 'NÃO'}`);
    console.log(`❌ Erro de verificação: ${post.verificationError || 'N/A'}`);
    console.log(`⏰ Próxima verificação: ${post.nextVerificationAt || 'N/A'}`);

    if (post.caption) {
      console.log(`💬 Caption (primeiros 100 chars): ${post.caption.substring(0, 100)}...`);
    }
  }

  console.log('─'.repeat(80));
}

checkByRockPosts()
  .catch(console.error)
  .finally(() => db.$disconnect());
