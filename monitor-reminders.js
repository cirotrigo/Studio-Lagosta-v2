/**
 * Monitor de lembretes - verifica posts agendados e status de disparo
 *
 * Uso:
 * node monitor-reminders.js
 */

const { PrismaClient } = require('./prisma/generated/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    console.log(`⏰ Horário atual: ${now.toLocaleString('pt-BR')}\n`);

    // Posts que deveriam disparar lembrete nos próximos 10 minutos
    console.log('📅 PRÓXIMOS LEMBRETES (próximos 10 min):\n');

    const upcomingReminders = await prisma.socialPost.findMany({
      where: {
        publishType: 'REMINDER',
        status: 'SCHEDULED',
        scheduledDatetime: {
          gte: now,
          lte: tenMinutesFromNow
        }
      },
      include: {
        Project: {
          select: {
            name: true,
            webhookReminderUrl: true
          }
        }
      },
      orderBy: { scheduledDatetime: 'asc' }
    });

    if (upcomingReminders.length === 0) {
      console.log('  ✅ Nenhum lembrete agendado para os próximos 10 minutos\n');
    } else {
      upcomingReminders.forEach((post, i) => {
        const scheduled = new Date(post.scheduledDatetime);
        const minutesUntil = Math.round((scheduled - now) / (1000 * 60));
        const reminderTime = new Date(scheduled.getTime() - 5 * 60 * 1000);

        console.log(`  ${i + 1}. ${post.Project.name} - ${scheduled.toLocaleTimeString('pt-BR')}`);
        console.log(`     Disparo em: ${minutesUntil} min (às ${reminderTime.toLocaleTimeString('pt-BR')})`);
        console.log(`     Webhook: ${post.Project.webhookReminderUrl ? '✅ Configurado' : '❌ NÃO configurado'}`);
        console.log(`     Status: ${post.reminderSentAt ? '✅ Enviado' : '⏳ Aguardando'}`);
        console.log('');
      });
    }

    // Posts que deveriam ter disparado nos últimos 5 minutos
    console.log('🔍 LEMBRETES RECENTES (últimos 5 min):\n');

    const recentReminders = await prisma.socialPost.findMany({
      where: {
        publishType: 'REMINDER',
        status: 'SCHEDULED',
        scheduledDatetime: {
          gte: fiveMinutesAgo,
          lte: now
        }
      },
      include: {
        Project: {
          select: {
            name: true,
            webhookReminderUrl: true
          }
        }
      },
      orderBy: { scheduledDatetime: 'desc' }
    });

    if (recentReminders.length === 0) {
      console.log('  ✅ Nenhum lembrete deveria ter sido disparado nos últimos 5 minutos\n');
    } else {
      recentReminders.forEach((post, i) => {
        const scheduled = new Date(post.scheduledDatetime);
        const reminderTime = new Date(scheduled.getTime() - 5 * 60 * 1000);

        console.log(`  ${i + 1}. ${post.Project.name} - ${scheduled.toLocaleTimeString('pt-BR')}`);
        console.log(`     Deveria disparar: ${reminderTime.toLocaleTimeString('pt-BR')}`);
        console.log(`     Webhook: ${post.Project.webhookReminderUrl ? '✅' : '❌'}`);
        console.log(`     Status: ${post.reminderSentAt ? '✅ Enviado em ' + new Date(post.reminderSentAt).toLocaleTimeString('pt-BR') : '❌ NÃO enviado'}`);

        if (!post.Project.webhookReminderUrl) {
          console.log(`     ⚠️  FALHA: Webhook não configurado!`);
        } else if (!post.reminderSentAt) {
          console.log(`     ⚠️  FALHA: Webhook configurado mas lembrete não foi enviado!`);
        }
        console.log('');
      });
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Executar a cada 30 segundos se --watch
if (process.argv.includes('--watch')) {
  console.log('👀 Modo watch ativado - atualizando a cada 30s...\n');
  console.log('Pressione Ctrl+C para parar\n');

  main();
  setInterval(main, 30000);
} else {
  main();
}
