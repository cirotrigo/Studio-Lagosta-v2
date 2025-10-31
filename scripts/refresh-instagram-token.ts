/**
 * Script para renovar o Instagram Access Token
 *
 * Este token deveria ser permanente, mas parece que expirou.
 * Vamos gerar um novo Page Access Token que nunca expira.
 */

const userToken = process.argv[2]

if (!userToken) {
  console.log(`
🔑 Script para Renovar Instagram Access Token

USO:
  npx tsx scripts/refresh-instagram-token.ts [USER_ACCESS_TOKEN]

PASSO A PASSO:

1. Acesse: https://developers.facebook.com/tools/explorer/

2. Selecione seu App: "ciro_trigo"

3. Clique em "Get Token" → "Get User Access Token"

4. Selecione as permissões:
   - instagram_basic
   - instagram_content_publish
   - pages_read_engagement
   - pages_show_list

5. Clique em "Generate Access Token"

6. Copie o token gerado

7. Execute:
   npx tsx scripts/refresh-instagram-token.ts [TOKEN_COPIADO]

---

⚠️ IMPORTANTE: O token de usuário expira em 1 hora!
Este script vai convertê-lo em um Page Access Token que nunca expira.
`)
  process.exit(1)
}

async function refreshToken() {
  console.log('\n🔄 Renovando Instagram Access Token...\n')

  // Step 1: Exchange for long-lived token (60 days)
  console.log('📝 Passo 1: Trocando por token de longa duração (60 dias)...')

  const appId = '616046264322031' // Do .env.local
  const appSecret = '2bcf01f6dd800e06fc35f64d16224d68' // Do .env.local

  const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userToken}`

  const exchangeResponse = await fetch(exchangeUrl)
  const exchangeData = await exchangeResponse.json()

  if (exchangeData.error) {
    console.error('❌ Erro ao trocar token:', exchangeData.error.message)
    process.exit(1)
  }

  const longLivedToken = exchangeData.access_token
  console.log('✅ Token de longa duração obtido!\n')

  // Step 2: Get Facebook Pages
  console.log('📝 Passo 2: Buscando páginas do Facebook...')

  const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
  const pagesResponse = await fetch(pagesUrl)
  const pagesData = await pagesResponse.json()

  if (pagesData.error) {
    console.error('❌ Erro ao buscar páginas:', pagesData.error.message)
    process.exit(1)
  }

  console.log(`✅ ${pagesData.data.length} página(s) encontrada(s)\n`)

  // Find "Estúdio Ciro Trigo" page
  const targetPage = pagesData.data.find((page: any) =>
    page.name.includes('Estúdio') || page.name.includes('Ciro Trigo')
  )

  if (!targetPage) {
    console.log('❌ Página "Estúdio Ciro Trigo" não encontrada')
    console.log('\n📋 Páginas disponíveis:')
    pagesData.data.forEach((page: any, index: number) => {
      console.log(`  ${index + 1}. ${page.name} (ID: ${page.id})`)
    })
    console.log('\n💡 Execute o script novamente e modifique o código para usar a página correta.\n')
    process.exit(1)
  }

  const pageAccessToken = targetPage.access_token
  console.log(`✅ Página encontrada: ${targetPage.name}`)
  console.log(`✅ Page ID: ${targetPage.id}\n`)

  // Step 3: Get Instagram Business Account
  console.log('📝 Passo 3: Buscando conta Instagram associada...')

  const igAccountUrl = `https://graph.facebook.com/v21.0/${targetPage.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
  const igAccountResponse = await fetch(igAccountUrl)
  const igAccountData = await igAccountResponse.json()

  if (igAccountData.error || !igAccountData.instagram_business_account) {
    console.error('❌ Erro ao buscar conta Instagram:', igAccountData.error?.message || 'Conta não encontrada')
    process.exit(1)
  }

  const instagramAccountId = igAccountData.instagram_business_account.id
  console.log(`✅ Instagram Account ID: ${instagramAccountId}\n`)

  // Step 4: Verify token never expires
  console.log('📝 Passo 4: Verificando expiração do token...')

  const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${pageAccessToken}&access_token=${pageAccessToken}`
  const debugResponse = await fetch(debugUrl)
  const debugData = await debugResponse.json()

  const expiresAt = debugData.data?.expires_at || 0

  if (expiresAt === 0) {
    console.log('✅ Token NUNCA expira! 🎉\n')
  } else {
    console.log(`⚠️ Token expira em: ${new Date(expiresAt * 1000).toLocaleString()}\n`)
  }

  // Summary
  console.log('━'.repeat(60))
  console.log('📋 RESUMO - Copie estes valores para o .env.local:\n')
  console.log('INSTAGRAM_ACCESS_TOKEN=' + pageAccessToken)
  console.log('INSTAGRAM_ACCOUNT_ID=' + instagramAccountId)
  console.log('\n━'.repeat(60))
  console.log('\n💡 PRÓXIMOS PASSOS:\n')
  console.log('1. Copie o INSTAGRAM_ACCESS_TOKEN acima')
  console.log('2. Cole no arquivo .env.local (substitua o token antigo)')
  console.log('3. Adicione também no Vercel Dashboard em Environment Variables')
  console.log('4. Execute: vercel env pull (para sincronizar localmente)')
  console.log('5. Teste novamente o webhook!\n')
  console.log('✅ Token renovado com sucesso!\n')
}

refreshToken().catch((error) => {
  console.error('❌ Erro:', error)
  process.exit(1)
})
