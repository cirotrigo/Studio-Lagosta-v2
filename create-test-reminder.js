/**
 * Script para criar um post de TESTE com publishType=REMINDER
 * Para testar o sistema de lembretes
 */

const { PrismaClient } = require('./prisma/generated/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Buscar projeto Lagosta Criativa
    const project = await prisma.project.findFirst({
      where: { name: { contains: 'Lagosta', mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        webhookReminderUrl: true,
        userId: true
      }
    });

    if (!project) {
      console.error('❌ Projeto Lagosta Criativa não encontrado');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`📂 Projeto: ${project.name} (ID: ${project.id})`);
    console.log(`🔗 Webhook: ${project.webhookReminderUrl || '❌ NÃO CONFIGURADO'}\n`);

    if (!project.webhookReminderUrl) {
      console.error('❌ Configure o webhook antes de criar o post de teste!');
      console.log('\nUse:');
      console.log(`node configure-reminder-webhook.js ${project.id} <sua-url-n8n>`);
      await prisma.$disconnect();
      process.exit(1);
    }

    // Agendar para daqui a 10 minutos
    const scheduledTime = new Date(Date.now() + 10 * 60 * 1000);

    const userId = project.userId;
    if (!userId) {
      console.error('❌ Nenhum usuário encontrado para o projeto');
      await prisma.$disconnect();
      process.exit(1);
    }

    // Criar post de teste
    const post = await prisma.socialPost.create({
      data: {
        projectId: project.id,
        userId: userId,
        postType: 'POST',
        caption: `🔔 Post de TESTE - Lembrete agendado para ${scheduledTime.toLocaleTimeString('pt-BR')}`,
        mediaUrls: ['https://via.placeholder.com/1080x1080.png?text=Teste+Lembrete'],
        scheduleType: 'SCHEDULED',
        scheduledDatetime: scheduledTime,
        publishType: 'REMINDER', // ⚠️ IMPORTANTE
        status: 'SCHEDULED',
      }
    });

    console.log('✅ Post de teste criado com sucesso!\n');
    console.log(`📌 Post ID: ${post.id}`);
    console.log(`🕐 Agendado para: ${scheduledTime.toLocaleString('pt-BR')}`);
    console.log(`🔔 Lembrete será disparado: ${new Date(scheduledTime.getTime() - 5 * 60 * 1000).toLocaleString('pt-BR')}`);
    console.log(`📤 publishType: ${post.publishType}`);
    console.log(`📊 Status: ${post.status}`);
    console.log('\n⏰ Monitore com:');
    console.log('node monitor-reminders.js --watch');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
