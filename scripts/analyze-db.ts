import { db } from '../src/lib/db'

async function analyzeDatabase() {
  console.log('🔍 Analisando uso do banco de dados...\n')

  try {
    // Count records in each table
    const counts = {
      users: await db.user.count(),
      projects: await db.project.count(),
      templates: await db.template.count(),
      pages: await db.page.count(),
      generations: await db.generation.count(),
      logos: await db.logo.count(),
      elements: await db.element.count(),
      customFonts: await db.customFont.count(),
      brandColors: await db.brandColor.count(),
      storageObjects: await db.storageObject.count(),
      aiGeneratedImages: await db.aIGeneratedImage.count(),
      usageHistory: await db.usageHistory.count(),
      subscriptionEvents: await db.subscriptionEvent.count(),
      videoProcessingJobs: await db.videoProcessingJob.count(),
      socialPosts: await db.socialPost.count(),
      postRetries: await db.postRetry.count(),
      postLogs: await db.postLog.count(),
      cmsPages: await db.cMSPage.count(),
      cmsSections: await db.cMSSection.count(),
      cmsMedia: await db.cMSMedia.count(),
      knowledgeBaseEntries: await db.knowledgeBaseEntry.count(),
      knowledgeChunks: await db.knowledgeChunk.count(),
    }

    console.log('📊 Contagem de registros por tabela:\n')
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([table, count]) => {
        console.log(`  ${table.padEnd(25)} ${count.toString().padStart(8)} registros`)
      })

    console.log('\n📈 Tabelas com mais registros (potenciais para limpeza):\n')

    // Analyze Generations (usually the largest)
    const oldGenerations = await db.generation.count({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Older than 30 days
        }
      }
    })
    console.log(`  ✓ Generations antigas (>30 dias): ${oldGenerations}`)

    // Analyze Storage Objects
    const deletedStorage = await db.storageObject.count({
      where: {
        deletedAt: {
          not: null
        }
      }
    })
    console.log(`  ✓ StorageObjects deletados: ${deletedStorage}`)

    // Analyze Usage History
    const oldUsageHistory = await db.usageHistory.count({
      where: {
        timestamp: {
          lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Older than 90 days
        }
      }
    })
    console.log(`  ✓ UsageHistory antigo (>90 dias): ${oldUsageHistory}`)

    // Analyze Video Jobs
    const completedVideoJobs = await db.videoProcessingJob.count({
      where: {
        status: 'COMPLETED',
        completedAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Older than 7 days
        }
      }
    })
    console.log(`  ✓ VideoProcessingJobs completados (>7 dias): ${completedVideoJobs}`)

    // Analyze Post Logs
    const oldPostLogs = await db.postLog.count({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    })
    console.log(`  ✓ PostLogs antigos (>30 dias): ${oldPostLogs}`)

    // Analyze Knowledge Chunks (can be large)
    const knowledgeChunksSize = await db.knowledgeChunk.count()
    console.log(`  ✓ KnowledgeChunks (podem ocupar muito espaço): ${knowledgeChunksSize}`)

    console.log('\n💡 Recomendações de limpeza:\n')
    if (oldGenerations > 0) {
      console.log(`  • Deletar ${oldGenerations} generations antigas (>30 dias)`)
    }
    if (deletedStorage > 0) {
      console.log(`  • Limpar ${deletedStorage} storageObjects já deletados`)
    }
    if (oldUsageHistory > 0) {
      console.log(`  • Arquivar ${oldUsageHistory} registros antigos de usage history`)
    }
    if (completedVideoJobs > 0) {
      console.log(`  • Deletar ${completedVideoJobs} video jobs já completados`)
    }
    if (oldPostLogs > 0) {
      console.log(`  • Deletar ${oldPostLogs} logs antigos de posts`)
    }
    if (knowledgeChunksSize > 100) {
      console.log(`  • Revisar ${knowledgeChunksSize} knowledge chunks (podem ser grandes)`)
    }

    console.log('\n✅ Análise completa!\n')
    console.log('Execute "npm run db:clean" para limpar dados antigos (será criado)\n')

  } catch (error) {
    console.error('❌ Erro ao analisar banco:', error)
  } finally {
    await db.$disconnect()
  }
}

analyzeDatabase()
