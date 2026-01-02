/**
 * Script para configurar webhook de lembretes em um projeto
 *
 * Uso:
 * node configure-reminder-webhook.js <project-id> <webhook-url>
 *
 * Exemplo:
 * node configure-reminder-webhook.js 123 https://seu-n8n.com/webhook/reminder
 */

const { PrismaClient } = require('./prisma/generated/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Listar projetos se não houver argumentos
    if (process.argv.length < 4) {
      console.log('📋 Projetos disponíveis:\n');

      const projects = await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          webhookReminderUrl: true,
          _count: {
            select: {
              SocialPost: {
                where: {
                  publishType: 'REMINDER'
                }
              }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      projects.forEach(p => {
        console.log(`ID: ${p.id}`);
        console.log(`Nome: ${p.name}`);
        console.log(`Webhook: ${p.webhookReminderUrl || '❌ NÃO CONFIGURADO'}`);
        console.log(`Posts REMINDER: ${p._count.SocialPost}`);
        console.log('');
      });

      console.log('\n📝 Como usar:');
      console.log('node configure-reminder-webhook.js <project-id> <webhook-url>');
      console.log('\nExemplo:');
      console.log('node configure-reminder-webhook.js 123 https://seu-n8n.com/webhook/reminder');

      await prisma.$disconnect();
      return;
    }

    const projectId = parseInt(process.argv[2]);
    const webhookUrl = process.argv[3];

    // Validar URL
    if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
      console.error('❌ Erro: URL do webhook deve começar com http:// ou https://');
      await prisma.$disconnect();
      process.exit(1);
    }

    // Buscar projeto
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, webhookReminderUrl: true }
    });

    if (!project) {
      console.error(`❌ Erro: Projeto com ID ${projectId} não encontrado`);
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`\n📂 Projeto: ${project.name}`);
    console.log(`🔗 Webhook atual: ${project.webhookReminderUrl || 'NÃO CONFIGURADO'}`);
    console.log(`🔗 Novo webhook: ${webhookUrl}\n`);

    // Atualizar webhook
    await prisma.project.update({
      where: { id: projectId },
      data: { webhookReminderUrl: webhookUrl }
    });

    console.log('✅ Webhook configurado com sucesso!\n');

    // Verificar posts de lembrete agendados
    const upcomingReminders = await prisma.socialPost.count({
      where: {
        projectId: projectId,
        publishType: 'REMINDER',
        status: 'SCHEDULED',
        scheduledDatetime: { gte: new Date() }
      }
    });

    if (upcomingReminders > 0) {
      console.log(`📅 ${upcomingReminders} lembrete(s) agendado(s) para este projeto`);
      console.log('   Os próximos lembretes serão disparados automaticamente 5 minutos antes do horário agendado.');
    } else {
      console.log('💡 Nenhum lembrete agendado para este projeto no momento');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
