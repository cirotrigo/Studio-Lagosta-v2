import { db } from '../src/lib/db'

async function optimizeLogs() {
  console.log('🧹 Otimizando PostLogs...\n')

  try {
    // Keep only important logs (FAILED, SENT, CREATED)
    // Delete verbose logs (SCHEDULED, RETRIED, EDITED)
    console.log('1️⃣ Deletando logs menos importantes (SCHEDULED, RETRIED, EDITED)...')
    const deletedVerbose = await db.postLog.deleteMany({
      where: {
        event: {
          in: ['SCHEDULED', 'RETRIED', 'EDITED']
        }
      }
    })
    console.log(`   ✓ Deletados: ${deletedVerbose.count} registros\n`)

    // Keep only last 30 days of SENT logs (keep FAILED forever for debugging)
    console.log('2️⃣ Deletando logs SENT antigos (>30 dias)...')
    const deletedOldSent = await db.postLog.deleteMany({
      where: {
        event: 'SENT',
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${deletedOldSent.count} registros\n`)

    const total = deletedVerbose.count + deletedOldSent.count

    console.log('═══════════════════════════════════════════════════════')
    console.log(`✅ Otimização completa! Total deletado: ${total} registros`)
    console.log('═══════════════════════════════════════════════════════\n')

    // Show final count
    const remaining = await db.postLog.count()
    console.log(`📊 PostLogs restantes: ${remaining} registros`)
    console.log('   (Mantendo apenas: CREATED, FAILED e SENT recentes)\n')

  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await db.$disconnect()
  }
}

optimizeLogs()
