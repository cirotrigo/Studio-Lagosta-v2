/**
 * Script para renovar o Instagram Access Token
 *
 * Troca um User Access Token (curto, 1h) por um Page Access Token, que não
 * expira — diferente do token de Instagram Login, que vence em 60 dias.
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/refresh-instagram-token.ts <USER_TOKEN> [--page=<id|nome>] [--skip-vercel]
 *
 * Requer META_APP_ID e META_APP_SECRET no ambiente.
 *
 * O token resultante nunca é impresso: vai direto para o .env (com backup) e
 * para as variáveis de produção da Vercel.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

const userToken = process.argv[2]

if (!userToken) {
  console.log(`
🔑 Script para Renovar Instagram Access Token

USO:
  npx dotenv-cli -e .env -- npx tsx scripts/refresh-instagram-token.ts <TOKEN> [--page=<id ou nome>] [--skip-vercel]

PASSO A PASSO:

0. Garanta que o .env tem:
   META_APP_ID=1476916907060374
   META_APP_SECRET=<Configurações do app → Básico → Chave Secreta>

1. Acesse: https://developers.facebook.com/tools/explorer/

2. Selecione o App: "Studio Lagosta"

3. Clique em "Get Token" → "Get User Access Token"

4. Selecione as permissões:
   - instagram_basic
   - instagram_manage_insights     (métricas)
   - instagram_content_publish
   - pages_read_engagement
   - pages_show_list

5. Clique em "Generate Access Token" e copie

6. Execute:
   npx dotenv-cli -e .env -- npx tsx scripts/refresh-instagram-token.ts <TOKEN>

   O script grava no .env e envia para a Vercel sozinho — o token não
   aparece na tela nem precisa ser copiado de novo.

---

⚠️ O token de usuário expira em 1 hora — rode o script logo após gerar.
Ele converte num Page Access Token, que não expira.
`)
  process.exit(1)
}

async function refreshToken() {
  console.log('\n🔄 Renovando Instagram Access Token...\n')

  // Step 1: Exchange for long-lived token (60 days)
  console.log('📝 Passo 1: Trocando por token de longa duração (60 dias)...')

  // Credenciais vêm do ambiente. Estiveram hardcoded aqui num repositório
  // público — se ainda não foram rotacionadas no painel da Meta, rotacione.
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    console.error(
      '❌ Defina META_APP_ID e META_APP_SECRET no .env antes de rodar.\n' +
        '   Encontre em: https://developers.facebook.com/apps → seu app → Configurações → Básico'
    )
    process.exit(1)
  }

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

  // Página escolhida por --page=<id|trecho do nome>; sem isso, usa a única
  // disponível, ou lista as opções quando houver ambiguidade
  const pageArg = process.argv.find((a) => a.startsWith('--page='))?.split('=')[1]
  const pages = pagesData.data as Array<{ id: string; name: string; access_token: string }>

  const listarPaginas = () => {
    console.log('\n📋 Páginas disponíveis:')
    pages.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (ID: ${p.id})`))
    console.log('\n💡 Rode de novo com --page=<ID ou parte do nome>\n')
  }

  let targetPage: (typeof pages)[number] | undefined
  if (pageArg) {
    const alvo = pageArg.toLowerCase()
    const matches = pages.filter(
      (p) => p.id === pageArg || p.name.toLowerCase().includes(alvo)
    )
    if (matches.length === 0) {
      console.error(`❌ Nenhuma página corresponde a "${pageArg}"`)
      listarPaginas()
      process.exit(1)
    }
    if (matches.length > 1) {
      console.error(`❌ "${pageArg}" corresponde a ${matches.length} páginas — seja mais específico`)
      listarPaginas()
      process.exit(1)
    }
    targetPage = matches[0]
  } else if (pages.length === 1) {
    targetPage = pages[0]
  } else {
    console.error('❌ Há mais de uma página; escolha qual usar')
    listarPaginas()
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

  // Passo 5: gravar no .env local (o token nunca é impresso na tela)
  console.log('📝 Passo 5: Gravando no .env local...')
  const envPath = path.resolve(process.cwd(), '.env')
  const valores: Record<string, string> = {
    INSTAGRAM_ACCESS_TOKEN: pageAccessToken,
    INSTAGRAM_ACCOUNT_ID: instagramAccountId,
  }

  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, `${envPath}.bak-${Date.now()}`)
    let conteudo = fs.readFileSync(envPath, 'utf8')
    for (const [chave, valor] of Object.entries(valores)) {
      const linha = `${chave}=${valor}`
      const re = new RegExp(`^${chave}=.*$`, 'm')
      conteudo = re.test(conteudo) ? conteudo.replace(re, linha) : `${conteudo.replace(/\n*$/, '\n')}${linha}\n`
    }
    fs.writeFileSync(envPath, conteudo)
    console.log('✅ .env atualizado (backup criado ao lado)\n')
  } else {
    console.log('⚠️  .env não encontrado — pulando gravação local\n')
  }

  // Passo 6: enviar para a Vercel (produção), se o CLI estiver autenticado
  if (process.argv.includes('--skip-vercel')) {
    console.log('⏭️  --skip-vercel: não enviei para a Vercel\n')
  } else {
    console.log('📝 Passo 6: Enviando para a Vercel (produção)...')
    for (const [chave, valor] of Object.entries(valores)) {
      try {
        // remove o valor antigo (falha se não existir — tudo bem)
        execFileSync('vercel', ['env', 'rm', chave, 'production', '-y'], { stdio: 'ignore' })
      } catch {
        // variável ainda não existia
      }
      try {
        execFileSync('vercel', ['env', 'add', chave, 'production'], {
          input: valor,
          stdio: ['pipe', 'ignore', 'pipe'],
        })
        console.log(`✅ ${chave} enviada`)
      } catch (error: any) {
        console.error(`❌ Falha ao enviar ${chave}:`, error?.stderr?.toString?.().trim() || error?.message)
        console.error('   Rode "vercel login" e tente de novo, ou use --skip-vercel e configure pelo painel.')
      }
    }
    console.log()
  }

  console.log('━'.repeat(60))
  console.log(`Conta Instagram conectada: ${instagramAccountId}`)
  console.log(`Página: ${targetPage.name} (${targetPage.id})`)
  console.log('━'.repeat(60))
  console.log('\n💡 PRÓXIMO PASSO: redeploy na Vercel para a variável entrar em vigor.')
  console.log('   vercel --prod\n')
  console.log('✅ Token renovado com sucesso!\n')
}

refreshToken().catch((error) => {
  console.error('❌ Erro:', error)
  process.exit(1)
})
