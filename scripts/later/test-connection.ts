/**
 * Test Later API Connection
 *
 * This script tests the connection to Later API and lists available accounts.
 *
 * Usage:
 *   npx tsx scripts/later/test-connection.ts
 *
 * Required:
 *   LATER_API_KEY environment variable must be set
 */

// Load environment variables from .env
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from project root
config({ path: resolve(__dirname, '../../.env') })

import { getLaterClient } from '../../src/lib/later'

async function testConnection() {
  console.log('\n' + '='.repeat(80))
  console.log('🔌 TESTING LATER API CONNECTION')
  console.log('='.repeat(80) + '\n')

  try {
    // Check if API key is set
    const apiKey = process.env.LATER_API_KEY

    if (!apiKey) {
      throw new Error(
        'LATER_API_KEY not found in environment variables.\n' +
          'Please add it to your .env file:\n' +
          'LATER_API_KEY=your_api_key_here'
      )
    }

    console.log('✅ LATER_API_KEY found')
    console.log(`   Key: ${apiKey.substring(0, 10)}...`)
    console.log('')

    // Initialize Later client
    console.log('🔧 Initializing Later client...')
    const client = getLaterClient()
    console.log('✅ Client initialized')
    console.log('')

    // Test connection by listing accounts
    console.log('📡 Fetching connected accounts...')
    const accounts = await client.listAccounts()

    if (accounts.length === 0) {
      console.log('⚠️  No accounts found in Later')
      console.log('   Please connect an Instagram account in Later dashboard:')
      console.log('   https://app.getlate.dev/settings/accounts')
      return
    }

    console.log(`✅ Found ${accounts.length} account(s):\n`)

    // Display accounts
    accounts.forEach((account, index) => {
      console.log('='.repeat(80))
      console.log(`${index + 1}. @${account.username}`)
      console.log('='.repeat(80))
      console.log(`   Platform: ${account.platform}`)
      console.log(`   Account ID: ${account.id}`)
      console.log(`   Profile ID: ${account.profileId}`)
      console.log(`   Display Name: ${account.displayName || 'Not set'}`)
      console.log(`   Status: ${account.isActive ? '✅ Active' : '❌ Inactive'}`)
      console.log('')
    })

    // Get rate limit info
    const rateLimitInfo = client.getRateLimitInfo()

    if (rateLimitInfo) {
      console.log('='.repeat(80))
      console.log('📊 RATE LIMIT INFO')
      console.log('='.repeat(80))
      console.log(`   Limit: ${rateLimitInfo.limit} req/min`)
      console.log(`   Remaining: ${rateLimitInfo.remaining} req/min`)
      console.log(
        `   Utilization: ${Math.round(((rateLimitInfo.limit - rateLimitInfo.remaining) / rateLimitInfo.limit) * 100)}%`
      )
      console.log(`   Resets at: ${new Date(rateLimitInfo.reset * 1000).toLocaleString()}`)
      console.log('')
    }

    console.log('='.repeat(80))
    console.log('🎉 CONNECTION SUCCESSFUL!')
    console.log('='.repeat(80))
    console.log('\n💡 Next steps:')
    console.log('   1. Copy an Account ID from above')
    console.log('   2. Configure a project:')
    console.log('      npx tsx scripts/later/configure-project.ts "Project Name" <Account ID>')
    console.log('   3. Test posting via the UI or API')
    console.log('')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    console.error('\nPlease check:')
    console.error('  1. LATER_API_KEY is correct in .env')
    console.error('  2. You have an active Later account')
    console.error('  3. You have connected an Instagram account in Later')
    console.error('  4. Your internet connection is working')
    console.error('')
    process.exit(1)
  }
}

testConnection()
