import { db } from '../src/lib/db'

async function cleanAllRetries() {
  console.log('🧹 Limpando TODOS os PostRetries e PostLogs...\n')

  try {
    // Delete ALL PostRetries (they're accumulating too much)
    console.log('1️⃣ Deletando TODOS os PostRetries...')
    const deletedRetries = await db.postRetry.deleteMany({})
    console.log(`   ✓ Deletados: ${deletedRetries.count} registros\n`)

    // Delete ALL PostLogs older than 7 days (keep only recent)
    console.log('2️⃣ Deletando PostLogs antigos (>7 dias)...')
    const deletedLogs = await db.postLog.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${deletedLogs.count} registros\n`)

    console.log('═══════════════════════════════════════════════════════')
    console.log(`✅ Limpeza agressiva concluída!`)
    console.log(`   Total: ${deletedRetries.count + deletedLogs.count} registros deletados`)
    console.log('═══════════════════════════════════════════════════════\n')

    console.log('⚠️  IMPORTANTE: Agora execute no Neon SQL Editor:')
    console.log('   VACUUM FULL;')
    console.log('   REINDEX DATABASE neondb;\n')

  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await db.$disconnect()
  }
}

cleanAllRetries()
