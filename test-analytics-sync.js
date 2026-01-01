const { getLaterClient, resetLaterClient } = require('./src/lib/later/client')
const { db } = require('./src/lib/db')

async function main() {
  // Reset client to use new token
  resetLaterClient()
  const laterClient = getLaterClient()

  console.log('🧪 Testando sincronização de analytics...\n')

  // Find posts from Bacana project with laterPostId but no analytics
  const postsToSync = await db.socialPost.findMany({
    where: {
      laterPostId: { not: null },
      status: 'POSTED',
      OR: [
        { analyticsFetchedAt: null },
        { analyticsLikes: null }
      ]
    },
    select: {
      id: true,
      laterPostId: true,
      caption: true,
      sentAt: true,
      postType: true,
      Project: {
        select: {
          name: true
        }
      }
    },
    take: 5
  })

  console.log(`📊 Encontrados ${postsToSync.length} posts para sincronizar\n`)

  if (postsToSync.length === 0) {
    console.log('✅ Todos os posts já têm analytics')
    return
  }

  // Test fetching analytics for each post
  const results = {
    success: 0,
    failed: 0,
    errors: []
  }

  for (const post of postsToSync) {
    console.log(`\n🔍 Post ${post.id} (${post.Project.name})`)
    console.log(`   Later ID: ${post.laterPostId}`)
    console.log(`   Caption: ${(post.caption || '').substring(0, 50)}...`)

    try {
      // Fetch analytics from Later
      const analytics = await laterClient.getPostAnalytics(post.laterPostId)

      console.log(`   ✅ Analytics recebidos:`)
      console.log(`      Likes: ${analytics.metrics.likes}`)
      console.log(`      Comments: ${analytics.metrics.comments}`)
      console.log(`      Engagement: ${analytics.metrics.engagement}`)
      console.log(`      Reach: ${analytics.metrics.reach}`)
      console.log(`      Impressions: ${analytics.metrics.impressions}`)
      console.log(`      Views: ${analytics.metrics.views}`)

      // Update database
      await db.socialPost.update({
        where: { id: post.id },
        data: {
          analyticsLikes: analytics.metrics.likes,
          analyticsComments: analytics.metrics.comments,
          analyticsShares: analytics.metrics.shares || null,
          analyticsReach: analytics.metrics.reach || null,
          analyticsImpressions: analytics.metrics.impressions || null,
          analyticsEngagement: analytics.metrics.engagement,
          analyticsFetchedAt: new Date()
        }
      })

      console.log(`   💾 Salvo no banco de dados`)

      results.success++
    } catch (error) {
      console.error(`   ❌ Erro: ${error.message}`)
      results.failed++
      results.errors.push({
        postId: post.id,
        laterPostId: post.laterPostId,
        error: error.message
      })
    }
  }

  console.log(`\n\n📈 Resultados:`)
  console.log(`   ✅ Sucesso: ${results.success}`)
  console.log(`   ❌ Falhas: ${results.failed}`)

  if (results.errors.length > 0) {
    console.log(`\n   Erros:`)
    results.errors.forEach(e => {
      console.log(`      - Post ${e.postId}: ${e.error}`)
    })
  }

  console.log('\n✅ Teste concluído!')
}

main()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect()
    process.exit(0)
  })
