const { getLaterClient } = require('./src/lib/later/client')
const { PrismaClient } = require('./prisma/generated/client')

async function main() {
  // Force reload of singleton to get new token
  const { resetLaterClient } = require('./src/lib/later/client')
  resetLaterClient()

  const laterClient = getLaterClient()
  const prisma = new PrismaClient()

  console.log('🔑 Testando novo token do Later...\n')

  try {
    // Test 1: List accounts
    console.log('1️⃣ Testando listAccounts()...')
    const accounts = await laterClient.listAccounts()
    console.log(`✅ Sucesso! Encontradas ${accounts.length} contas\n`)

    // Test 2: Get posts for Bacana
    const bacana = accounts.find(a => a.username === 'bacanabar')

    if (!bacana) {
      console.log('❌ Conta Bacana não encontrada')
      await prisma.$disconnect()
      return
    }

    const accountId = bacana._id || bacana.id
    console.log(`2️⃣ Buscando posts do Bacana (${accountId})...`)

    const response = await laterClient.request('/posts', {
      params: {
        accountId: accountId,
        platform: 'instagram',
        limit: 50,
        sortBy: 'date',
        order: 'desc'
      }
    })

    const posts = response.data || []
    console.log(`✅ Encontrados ${posts.length} posts!\n`)

    if (posts.length === 0) {
      console.log('⚠️  Nenhum post encontrado. Pode ser que:')
      console.log('   - Os posts estão em outro workspace')
      console.log('   - O token não tem permissão para ver posts')
      console.log('   - Os posts foram deletados')
      await prisma.$disconnect()
      return
    }

    // Show posts by state
    const byState = {}
    posts.forEach(p => {
      const state = p.state || 'undefined'
      byState[state] = (byState[state] || 0) + 1
    })

    console.log('Estados dos posts:')
    Object.entries(byState).forEach(([state, count]) => {
      console.log(`   ${state}: ${count}`)
    })

    // Show first 3 posts
    console.log('\nPrimeiros 3 posts:')
    posts.slice(0, 3).forEach((p, i) => {
      const postId = p.id || p._id
      console.log(`\n   ${i + 1}. ${postId}`)
      console.log(`      State: ${p.state}`)
      console.log(`      Caption: ${(p.caption || 'Sem caption').substring(0, 50)}...`)
      console.log(`      Published: ${p.publishedAt || 'N/A'}`)
    })

    // Test 3: Try to fetch analytics
    console.log('\n\n3️⃣ Testando busca de analytics...\n')

    let successCount = 0
    let failCount = 0
    let savedCount = 0

    for (const post of posts.slice(0, 10)) {  // Test first 10 posts
      const postId = post.id || post._id

      try {
        const analytics = await laterClient.getPostAnalytics(postId)

        console.log(`✅ ${postId}`)
        console.log(`   Likes: ${analytics.metrics?.likes || 0}`)
        console.log(`   Comments: ${analytics.metrics?.comments || 0}`)
        console.log(`   Engagement: ${analytics.metrics?.engagement || 0}`)

        successCount++

        // Check if post exists in database
        const dbPost = await prisma.socialPost.findFirst({
          where: { laterPostId: postId }
        })

        if (dbPost) {
          // Update analytics
          await prisma.socialPost.update({
            where: { id: dbPost.id },
            data: {
              analyticsLikes: analytics.metrics?.likes || 0,
              analyticsComments: analytics.metrics?.comments || 0,
              analyticsShares: analytics.metrics?.shares || null,
              analyticsReach: analytics.metrics?.reach || null,
              analyticsImpressions: analytics.metrics?.impressions || null,
              analyticsEngagement: analytics.metrics?.engagement || 0,
              analyticsFetchedAt: new Date()
            }
          })
          console.log(`   💾 Salvo no banco!`)
          savedCount++
        } else {
          console.log(`   ⚠️  Post não existe no banco`)
        }
      } catch (error) {
        failCount++
        if (failCount <= 3) {
          console.log(`❌ ${postId}: ${error.message}`)
        }
      }
    }

    console.log(`\n\n📊 RESULTADO DO TESTE:\n`)
    console.log(`   Posts encontrados no Later: ${posts.length}`)
    console.log(`   Analytics buscados com sucesso: ${successCount}`)
    console.log(`   Falhas ao buscar analytics: ${failCount}`)
    console.log(`   Salvos no banco: ${savedCount}`)

    if (successCount > 0) {
      console.log(`\n✅ SUCESSO! O novo token está funcionando!`)
      console.log(`\n🎯 Próximos passos:`)
      console.log(`   1. Execute o cron job para buscar analytics de todos os posts`)
      console.log(`   2. Acesse a aba Analytics para ver os dados`)

      console.log(`\n📝 Comando para executar cron job:`)
      console.log(`   curl -X GET "http://localhost:3000/api/cron/fetch-later-analytics" \\`)
      console.log(`     -H "Authorization: Bearer $CRON_SECRET"`)
    } else if (posts.length > 0 && successCount === 0) {
      console.log(`\n⚠️  Posts encontrados mas sem analytics`)
      console.log(`   Possíveis causas:`)
      console.log(`   - Posts não foram publicados no Instagram ainda`)
      console.log(`   - Addon Analytics não está ativo`)
      console.log(`   - Posts muito recentes (aguarde 15-30 min)`)
    }

  } catch (error) {
    console.log(`\n❌ ERRO: ${error.message}`)

    if (error.statusCode === 401) {
      console.log(`\n⚠️  Token inválido ou expirado`)
      console.log(`   1. Gere um novo token no Later Dashboard`)
      console.log(`   2. Atualize .env: LATER_API_TOKEN=novo_token`)
      console.log(`   3. Reinicie o servidor`)
    } else if (error.statusCode === 403) {
      console.log(`\n⚠️  Token sem permissão`)
      console.log(`   Verifique se o token tem permissão para:`)
      console.log(`   - Ver posts`)
      console.log(`   - Ver analytics`)
    }
  }

  await prisma.$disconnect()
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
