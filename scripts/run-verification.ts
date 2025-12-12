import { StoryVerifier } from '../src/lib/posts/verification/story-verifier';

async function runVerification() {
  console.log('🔍 Executando verificação de stories...\n');

  const verifier = new StoryVerifier();

  try {
    const summary = await verifier.processPendingVerifications();

    console.log('\n📊 Resultado da Verificação:');
    console.log('─'.repeat(50));
    console.log(`✅ Verificados: ${summary.verified}`);
    console.log(`❌ Falhados: ${summary.failed}`);
    console.log(`🔄 Reagendados: ${summary.rescheduled}`);
    console.log(`⏭️  Ignorados: ${summary.skipped}`);
    console.log(`📝 Total processados: ${summary.processed}`);
    console.log('─'.repeat(50));
  } catch (error) {
    console.error('❌ Erro ao executar verificação:', error);
    throw error;
  }
}

runVerification()
  .catch(console.error)
  .finally(() => process.exit(0));
