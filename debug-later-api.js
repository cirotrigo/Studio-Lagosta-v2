const { getLaterClient } = require('./src/lib/later/client')

async function main() {
  const { resetLaterClient } = require('./src/lib/later/client')
  resetLaterClient()

  const laterClient = getLaterClient()

  console.log('🔍 Debug detalhado da API do Later...\n')

  // Get Bacana account
  const accounts = await laterClient.listAccounts()
  const bacana = accounts.find(a => a.username === 'bacanabar')
  const accountId = bacana._id || bacana.id

  console.log(`Conta Bacana: ${accountId}\n`)

  // Try different ways to fetch posts
  console.log('Tentativa 1: Sem parâmetros extras')
  try {
    const r1 = await laterClient.request('/posts', {
      params: { accountId }
    })
    console.log(`   Resultado: ${JSON.stringify(r1).substring(0, 200)}`)
    console.log(`   Posts: ${r1.data?.length || 0}\n`)
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }

  console.log('Tentativa 2: Com platform=instagram')
  try {
    const r2 = await laterClient.request('/posts', {
      params: {
        accountId,
        platform: 'instagram'
      }
    })
    console.log(`   Resultado: ${JSON.stringify(r2).substring(0, 200)}`)
    console.log(`   Posts: ${r2.data?.length || 0}\n`)
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }

  console.log('Tentativa 3: Com limit maior')
  try {
    const r3 = await laterClient.request('/posts', {
      params: {
        accountId,
        platform: 'instagram',
        limit: 200
      }
    })
    console.log(`   Resultado: ${JSON.stringify(r3).substring(0, 200)}`)
    console.log(`   Posts: ${r3.data?.length || 0}\n`)
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }

  console.log('Tentativa 4: Sem accountId (todos os posts)')
  try {
    const r4 = await laterClient.request('/posts', {
      params: {
        platform: 'instagram',
        limit: 50
      }
    })
    console.log(`   Resultado: ${JSON.stringify(r4).substring(0, 200)}`)
    console.log(`   Posts: ${r4.data?.length || 0}\n`)
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }

  console.log('Tentativa 5: Endpoint /analytics direto')
  try {
    const r5 = await laterClient.request('/analytics', {
      params: {
        platform: 'instagram',
        limit: 50
      }
    })
    console.log(`   Resultado: ${JSON.stringify(r5).substring(0, 200)}`)
    console.log(`   Posts com analytics: ${r5.posts?.length || 0}\n`)

    if (r5.posts && r5.posts.length > 0) {
      console.log('   ✅ POSTS ENCONTRADOS VIA /analytics!\n')
      console.log('   Primeiros 3 posts:')
      r5.posts.slice(0, 3).forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.id || p._id}`)
        console.log(`         Caption: ${(p.caption || '').substring(0, 40)}`)
        console.log(`         Likes: ${p.metrics?.likes || 0}`)
        console.log(`         Engagement: ${p.metrics?.engagement || 0}`)
      })
    }
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }

  console.log('\nTentativa 6: Verificar workspaces')
  try {
    const workspaces = await laterClient.request('/workspaces')
    console.log(`   Workspaces: ${JSON.stringify(workspaces, null, 2)}`)
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }

  console.log('\nTentativa 7: Detalhes da conta Bacana')
  try {
    const accountDetails = await laterClient.request(`/accounts/${accountId}`)
    console.log(`   Account details: ${JSON.stringify(accountDetails, null, 2).substring(0, 500)}`)
  } catch (e) {
    console.log(`   Erro: ${e.message}\n`)
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
