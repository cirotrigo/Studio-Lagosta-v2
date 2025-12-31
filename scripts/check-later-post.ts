/**
 * Check Later Post Details
 * Fetches post details from Later API to verify which account it was published to
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { getLaterClient } from '../src/lib/later/client'

const LATER_POST_ID = '69558cc42d37d01972503c01'

async function checkLaterPost() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 VERIFICAR POST NO LATER API')
    console.log('='.repeat(80) + '\n')

    const laterClient = getLaterClient()

    console.log(`📋 Buscando post: ${LATER_POST_ID}\n`)

    const post = await laterClient.getPost(LATER_POST_ID)

    const postData = post as any

    console.log('✅ Post encontrado!\n')
    console.log('='.repeat(80))
    console.log(`📝 Conteúdo: ${postData.content?.substring(0, 60)}...`)
    console.log(`📊 Status: ${post.status}`)
    console.log(`📅 Criado em: ${new Date(post.createdAt).toLocaleString('pt-BR')}`)

    if (postData.platforms && postData.platforms.length > 0) {
      console.log(`\n📱 PLATAFORMAS (${postData.platforms.length}):`)

      postData.platforms.forEach((platform: any, i: number) => {
        console.log(`\n   ${i + 1}. ${platform.platform}`)
        console.log(`      Status: ${platform.status}`)

        if (platform.accountId) {
          const accountId = typeof platform.accountId === 'object'
            ? platform.accountId._id
            : platform.accountId

          const username = typeof platform.accountId === 'object'
            ? platform.accountId.username
            : 'N/A'

          console.log(`      Account ID: ${accountId}`)
          console.log(`      Username: ${username}`)

          // Check which project this matches
          if (accountId === '695566904207e06f4ca83584') {
            console.log(`      ✅ CORRETO: Esta é a conta do BACANA!`)
          } else if (accountId === '6951bef24207e06f4ca82e68') {
            console.log(`      ❌ ERRO: Esta é a conta do LAGOSTA CRIATIVA!`)
          } else {
            console.log(`      ⚠️  Conta desconhecida`)
          }
        }

        if (platform.platformPostUrl) {
          console.log(`      URL: ${platform.platformPostUrl}`)
        }

        if (platform.publishedAt) {
          console.log(`      Publicado em: ${new Date(platform.publishedAt).toLocaleString('pt-BR')}`)
        }
      })
    }

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message)
    process.exit(1)
  }
}

checkLaterPost()
