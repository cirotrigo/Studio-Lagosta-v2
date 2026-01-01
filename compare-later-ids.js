const { getLaterClient, resetLaterClient } = require('./src/lib/later/client')
const { db } = require('./src/lib/db')

async function main() {
  resetLaterClient()
  const laterClient = getLaterClient()

  console.log('🔍 Comparando IDs do Later API com banco de dados...\n')

  // Fetch all analytics from Later
  const analyticsMap = await laterClient.getAllPostAnalytics({
    platform: 'instagram',
    limit: 100,
  })

  console.log(`📊 Later API retornou ${analyticsMap.size} posts\n`)

  // Get posts from database
  const dbPosts = await db.socialPost.findMany({
    where: {
      laterPostId: { not: null },
    },
    select: {
      id: true,
      laterPostId: true,
      caption: true,
      Project: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 20
  })

  console.log(`💾 Banco de dados tem ${dbPosts.length} posts com laterPostId\n`)

  // Later IDs from API
  console.log('📋 IDs retornados pela Later API:')
  const laterIds = Array.from(analyticsMap.keys())
  laterIds.forEach((id, index) => {
    const analytics = analyticsMap.get(id)
    console.log(`   ${index + 1}. ${id} (${analytics?.metrics.likes || 0} likes)`)
  })

  console.log('\n💾 IDs no banco de dados:')
  dbPosts.forEach((post, index) => {
    console.log(`   ${index + 1}. ${post.laterPostId} - ${post.Project.name} - ${(post.caption || '').substring(0, 40)}`)
  })

  // Find matches
  console.log('\n🔍 Comparação:')
  let matches = 0
  let mismatches = 0

  dbPosts.forEach(post => {
    const found = analyticsMap.has(post.laterPostId)
    if (found) {
      console.log(`   ✅ MATCH: ${post.laterPostId} - ${post.Project.name}`)
      matches++
    } else {
      console.log(`   ❌ NOT FOUND: ${post.laterPostId} - ${post.Project.name}`)
      mismatches++
    }
  })

  console.log(`\n📈 Resumo:`)
  console.log(`   ✅ Matches: ${matches}`)
  console.log(`   ❌ Not Found: ${mismatches}`)

  // Check if API posts exist in DB
  console.log('\n🔄 Posts da API que NÃO estão no banco:')
  let apiOnlyPosts = 0
  laterIds.forEach(id => {
    const inDb = dbPosts.some(p => p.laterPostId === id)
    if (!inDb) {
      const analytics = analyticsMap.get(id)
      console.log(`   - ${id} (${analytics?.metrics.likes || 0} likes, ${analytics?.metrics.reach || 0} reach)`)
      apiOnlyPosts++
    }
  })

  console.log(`\n   Total: ${apiOnlyPosts} posts na API que não estão no banco`)
}

main()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect()
    process.exit(0)
  })
