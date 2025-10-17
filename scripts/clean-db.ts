import { db } from '../src/lib/db'

async function cleanDatabase() {
  console.log('🧹 Iniciando limpeza do banco de dados...\n')

  let totalDeleted = 0

  try {
    // 1. Deletar Generations antigas (>30 dias)
    console.log('1️⃣ Deletando Generations antigas (>30 dias)...')
    const oldGenerations = await db.generation.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${oldGenerations.count} registros\n`)
    totalDeleted += oldGenerations.count

    // 2. Limpar StorageObjects deletados
    console.log('2️⃣ Limpando StorageObjects já deletados...')
    const deletedStorage = await db.storageObject.deleteMany({
      where: {
        deletedAt: {
          not: null
        }
      }
    })
    console.log(`   ✓ Deletados: ${deletedStorage.count} registros\n`)
    totalDeleted += deletedStorage.count

    // 3. Arquivar UsageHistory muito antigo (>90 dias)
    console.log('3️⃣ Deletando UsageHistory antigo (>90 dias)...')
    const oldUsageHistory = await db.usageHistory.deleteMany({
      where: {
        timestamp: {
          lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${oldUsageHistory.count} registros\n`)
    totalDeleted += oldUsageHistory.count

    // 4. Deletar VideoProcessingJobs completados (>7 dias)
    console.log('4️⃣ Deletando VideoProcessingJobs completados (>7 dias)...')
    const completedVideoJobs = await db.videoProcessingJob.deleteMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${completedVideoJobs.count} registros\n`)
    totalDeleted += completedVideoJobs.count

    // 5. Deletar VideoProcessingJobs falhados (>7 dias)
    console.log('5️⃣ Deletando VideoProcessingJobs falhados (>7 dias)...')
    const failedVideoJobs = await db.videoProcessingJob.deleteMany({
      where: {
        status: 'FAILED',
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${failedVideoJobs.count} registros\n`)
    totalDeleted += failedVideoJobs.count

    // 6. Deletar PostLogs antigos (>30 dias)
    console.log('6️⃣ Deletando PostLogs antigos (>30 dias)...')
    const oldPostLogs = await db.postLog.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${oldPostLogs.count} registros\n`)
    totalDeleted += oldPostLogs.count

    // 7. Deletar PostRetries completados ou muito antigos
    console.log('7️⃣ Deletando PostRetries antigos (>7 dias)...')
    const oldPostRetries = await db.postRetry.deleteMany({
      where: {
        OR: [
          { status: 'SUCCESS' },
          { status: 'FAILED' },
          {
            createdAt: {
              lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        ]
      }
    })
    console.log(`   ✓ Deletados: ${oldPostRetries.count} registros\n`)
    totalDeleted += oldPostRetries.count

    // 8. Deletar SubscriptionEvents antigos (>180 dias)
    console.log('8️⃣ Deletando SubscriptionEvents antigos (>180 dias)...')
    const oldSubscriptionEvents = await db.subscriptionEvent.deleteMany({
      where: {
        occurredAt: {
          lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`   ✓ Deletados: ${oldSubscriptionEvents.count} registros\n`)
    totalDeleted += oldSubscriptionEvents.count

    // 9. VACUUM (compactar banco) - Executar manualmente via SQL
    console.log('9️⃣ Para compactar o banco, execute manualmente no Neon:')
    console.log('   VACUUM FULL;\n')

    console.log('═══════════════════════════════════════════════════════')
    console.log(`✅ Limpeza concluída! Total deletado: ${totalDeleted} registros`)
    console.log('═══════════════════════════════════════════════════════\n')

    console.log('💡 Próximos passos:')
    console.log('   1. Acesse Neon Console: https://console.neon.tech/')
    console.log('   2. Vá no SQL Editor do seu banco')
    console.log('   3. Execute: VACUUM FULL;')
    console.log('   4. Execute: REINDEX DATABASE seu_banco;')
    console.log('   5. Isso recuperará espaço em disco\n')

  } catch (error) {
    console.error('❌ Erro durante limpeza:', error)
  } finally {
    await db.$disconnect()
  }
}

cleanDatabase()
