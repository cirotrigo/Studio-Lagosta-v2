const { getLaterClient } = require('./src/lib/later/client')

async function main() {
  const { resetLaterClient } = require('./src/lib/later/client')
  resetLaterClient()

  const laterClient = getLaterClient()

  console.log('📊 Inspecionando estrutura completa dos posts via /analytics...\n')

  // Get Bacana account
  const accounts = await laterClient.listAccounts()
  const bacana = accounts.find(a => a.username === 'bacanabar')
  const accountId = bacana._id || bacana.id

  console.log(`Conta Bacana ID: ${accountId}\n`)

  // Fetch via analytics endpoint
  const response = await laterClient.request('/analytics', {
    params: {
      platform: 'instagram',
      limit: 50
    }
  })

  console.log('📈 Overview:')
  console.log(JSON.stringify(response.overview, null, 2))
  console.log()

  if (response.posts && response.posts.length > 0) {
    console.log(`\n✅ Total de posts: ${response.posts.length}\n`)

    console.log('📝 Estrutura COMPLETA do primeiro post:')
    console.log(JSON.stringify(response.posts[0], null, 2))
    console.log()

    console.log('📝 Estrutura COMPLETA do segundo post:')
    console.log(JSON.stringify(response.posts[1], null, 2))
    console.log()

    console.log('📝 Estrutura COMPLETA do terceiro post:')
    console.log(JSON.stringify(response.posts[2], null, 2))
    console.log()

    // Check for posts with actual metrics
    const postsWithMetrics = response.posts.filter(p =>
      p.metrics && (p.metrics.likes > 0 || p.metrics.engagement > 0)
    )

    if (postsWithMetrics.length > 0) {
      console.log(`\n🎯 Posts com métricas (${postsWithMetrics.length}):`)
      postsWithMetrics.slice(0, 3).forEach((post, i) => {
        console.log(`\n${i + 1}. Post ID: ${post._id || post.id}`)
        console.log(JSON.stringify(post, null, 2))
      })
    }

    // Check fields
    console.log('\n🔍 Campos disponíveis nos posts:')
    const allFields = new Set()
    response.posts.forEach(post => {
      Object.keys(post).forEach(key => allFields.add(key))
    })
    console.log(Array.from(allFields).sort())
  } else {
    console.log('❌ Nenhum post retornado')
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
