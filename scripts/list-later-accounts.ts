/**
 * List Later Accounts
 * Fetches all Instagram accounts connected to the Later API
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { getLaterClient } from '../src/lib/later/client'

async function listLaterAccounts() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('📱 LISTAR CONTAS DO INSTAGRAM CONECTADAS NO LATER')
    console.log('='.repeat(80) + '\n')

    const laterClient = getLaterClient()

    console.log('🔍 Buscando contas conectadas via Later API...\n')

    // List all accounts
    const accounts = await laterClient.listAccounts()

    console.log(`✅ Encontradas ${accounts.length} conta(s) conectada(s):\n`)
    console.log('='.repeat(80))

    accounts.forEach((account, i) => {
      const accountData = account as any

      console.log(`\n${i + 1}. ${account.username || account.displayName}`)
      console.log(`   Platform: ${account.platform}`)
      console.log(`   Account ID: ${account._id}`)
      console.log(`   Profile ID: ${accountData.profileId || account._id}`)
      console.log(`   Display Name: ${account.displayName || 'N/A'}`)
      console.log(`   Status: ${account.isActive ? '✅ Ativa' : '❌ Inativa'}`)

      if (accountData.metadata) {
        const metadata = accountData.metadata as any
        if (metadata.profileData) {
          console.log(`   Followers: ${metadata.profileData.followersCount || 'N/A'}`)
        }
      }
    })

    console.log('\n' + '='.repeat(80))
    console.log('💡 USE ESTES IDs PARA CONFIGURAR OS PROJETOS:\n')

    accounts.forEach((account) => {
      console.log(`   @${account.username}: ${account._id}`)
    })

    console.log('\n' + '='.repeat(80) + '\n')

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message)

    if (error.statusCode === 401) {
      console.error('\n⚠️  Erro de autenticação. Verifique a LATE_API_KEY no arquivo .env')
    }

    process.exit(1)
  }
}

listLaterAccounts()
