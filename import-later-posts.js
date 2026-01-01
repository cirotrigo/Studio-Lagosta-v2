const { getLaterClient, resetLaterClient } = require('./src/lib/later/client')
const { db } = require('./src/lib/db')

async function main() {
  resetLaterClient()
  const laterClient = getLaterClient()

  console.log('📥 Importando posts do Later para o banco de dados...\n')

  // Get accounts to map profileId to projectId
  const accounts = await laterClient.listAccounts()
  console.log(`📋 Encontradas ${accounts.length} contas no Later\n`)

  // Get all analytics (which includes post data)
  const analyticsMap = await laterClient.getAllPostAnalytics({
    platform: 'instagram',
    limit: 100,
  })

  console.log(`📊 Later API retornou ${analyticsMap.size} posts com analytics\n`)

  // Get Bacana account
  const bacana = accounts.find(a => a.username === 'bacanabar')
  if (!bacana) {
    console.error('❌ Conta Bacana não encontrada no Later')
    return
  }

  console.log(`🎯 Conta Bacana: ${bacana.username} (ID: ${bacana._id})`)
  console.log(`   Profile ID: ${bacana.profileId}\n`)

  // Find Bacana project in database
  const bacanaProject = await db.project.findFirst({
    where: {
      laterAccountId: bacana._id
    },
    select: {
      id: true,
      name: true,
      userId: true
    }
  })

  if (!bacanaProject) {
    console.error('❌ Projeto Bacana não encontrado no banco de dados')
    return
  }

  console.log(`💾 Projeto no banco: ${bacanaProject.name} (ID: ${bacanaProject.id})`)
  console.log(`   User ID: ${bacanaProject.userId}\n`)

  // Import posts
  const results = {
    imported: 0,
    skipped: 0,
    errors: 0
  }

  for (const [laterPostId, analytics] of analyticsMap.entries()) {
    try {
      // Check if post already exists
      const existing = await db.socialPost.findFirst({
        where: { laterPostId }
      })

      if (existing) {
        console.log(`⏭️  Post ${laterPostId} já existe no banco (ID: ${existing.id})`)
        results.skipped++
        continue
      }

      console.log(`\n📥 Importando post ${laterPostId}...`)
      console.log(`   Likes: ${analytics.metrics.likes}`)
      console.log(`   Reach: ${analytics.metrics.reach}`)
      console.log(`   Published: ${analytics.publishedAt}`)

      // Create post in database
      const post = await db.socialPost.create({
        data: {
          projectId: bacanaProject.id,
          userId: bacanaProject.userId,
          laterPostId: laterPostId,
          postType: 'POST', // Default to POST, could infer from media
          caption: '', // Analytics endpoint doesn't return caption
          status: 'POSTED',
          scheduleType: 'SCHEDULED',
          sentAt: new Date(analytics.publishedAt),
          publishedUrl: analytics.platformPostUrl || null,

          // Analytics data
          analyticsLikes: analytics.metrics.likes,
          analyticsComments: analytics.metrics.comments,
          analyticsShares: analytics.metrics.shares || null,
          analyticsReach: analytics.metrics.reach || null,
          analyticsImpressions: analytics.metrics.impressions || null,
          analyticsEngagement: analytics.metrics.engagement,
          analyticsFetchedAt: new Date(),
        }
      })

      console.log(`   ✅ Post importado com ID: ${post.id}`)
      results.imported++

    } catch (error) {
      console.error(`   ❌ Erro ao importar post ${laterPostId}:`, error.message)
      results.errors++
    }
  }

  console.log(`\n\n📈 Resultados da importação:`)
  console.log(`   ✅ Importados: ${results.imported}`)
  console.log(`   ⏭️  Já existiam: ${results.skipped}`)
  console.log(`   ❌ Erros: ${results.errors}`)
}

main()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect()
    process.exit(0)
  })
