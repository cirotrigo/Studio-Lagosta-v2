/**
 * Later Integration Setup Helper
 *
 * This script helps you set up Later integration step by step.
 *
 * Usage:
 *   npx tsx scripts/later/setup.ts
 */

// Load environment variables from .env
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import crypto from 'crypto'
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve)
  })
}

async function setup() {
  console.log('\n' + '='.repeat(80))
  console.log('🚀 LATER INTEGRATION SETUP')
  console.log('='.repeat(80) + '\n')

  // Check if LATER_API_KEY is already set
  const apiKey = process.env.LATER_API_KEY

  if (!apiKey) {
    console.log('📋 STEP 1: Get Later API Key')
    console.log('='.repeat(80))
    console.log('')
    console.log('1. Go to: https://getlate.dev')
    console.log('2. Sign up for a FREE account')
    console.log('3. Connect your Instagram account')
    console.log('4. Go to Settings → API')
    console.log('5. Generate a new API key')
    console.log('6. Copy the key')
    console.log('')
    console.log('Then add it to your .env file:')
    console.log('')
    console.log('   LATER_API_KEY=your_api_key_here')
    console.log('')
    console.log('='.repeat(80) + '\n')

    const answer = await question('Have you added LATER_API_KEY to .env? (y/n): ')

    if (answer.toLowerCase() !== 'y') {
      console.log('\n⚠️  Please add LATER_API_KEY to .env first, then run this script again.')
      rl.close()
      return
    }

    console.log('\n✅ Great! Please restart this script to continue.\n')
    rl.close()
    return
  }

  console.log('✅ LATER_API_KEY found: ' + apiKey.substring(0, 10) + '...')
  console.log('')

  // Check if LATER_WEBHOOK_SECRET is set
  const webhookSecret = process.env.LATER_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.log('📋 STEP 2: Generate Webhook Secret')
    console.log('='.repeat(80))
    console.log('')

    const answer = await question('Generate webhook secret now? (y/n): ')

    if (answer.toLowerCase() === 'y') {
      const secret = crypto.randomBytes(32).toString('hex')

      console.log('')
      console.log('Generated webhook secret:')
      console.log('')
      console.log('  ' + secret)
      console.log('')
      console.log('Add this to your .env file:')
      console.log('')
      console.log('   LATER_WEBHOOK_SECRET=' + secret)
      console.log('')
      console.log('='.repeat(80) + '\n')

      const added = await question('Have you added it to .env? (y/n): ')

      if (added.toLowerCase() !== 'y') {
        console.log('\n⚠️  Please add LATER_WEBHOOK_SECRET to .env, then run this script again.\n')
        rl.close()
        return
      }
    }
  } else {
    console.log('✅ LATER_WEBHOOK_SECRET found')
    console.log('')
  }

  // Test connection
  console.log('📋 STEP 3: Test Connection')
  console.log('='.repeat(80))
  console.log('')

  const testNow = await question('Test Later API connection now? (y/n): ')

  if (testNow.toLowerCase() === 'y') {
    console.log('')
    console.log('Running test-connection.ts...')
    console.log('='.repeat(80))
    rl.close()

    // Import and run test
    try {
      const { getLaterClient } = await import('../../src/lib/later')
      const client = getLaterClient()
      const accounts = await client.listAccounts()

      console.log('')
      console.log('✅ Connection successful!')
      console.log(`   Found ${accounts.length} account(s)`)
      console.log('')

      if (accounts.length > 0) {
        console.log('Connected accounts:')
        accounts.forEach((account, i) => {
          console.log(`   ${i + 1}. @${account.username} (${account.id})`)
        })
        console.log('')
      }

      console.log('='.repeat(80))
      console.log('🎉 SETUP COMPLETE!')
      console.log('='.repeat(80))
      console.log('')
      console.log('Next steps:')
      console.log('  1. Configure a project:')
      console.log('     npx tsx scripts/later/configure-project.ts "Project Name" ' + (accounts[0]?.id || 'acc_xxxxx'))
      console.log('')
      console.log('  2. Create a test post via the UI')
      console.log('')
      console.log('  3. Check logs for "Using Later API"')
      console.log('')
    } catch (error) {
      console.error('\n❌ Connection failed:', error instanceof Error ? error.message : error)
      console.log('\nPlease check your LATER_API_KEY and try again.\n')
    }
  } else {
    rl.close()
    console.log('')
    console.log('='.repeat(80))
    console.log('✅ SETUP COMPLETE!')
    console.log('='.repeat(80))
    console.log('')
    console.log('Next steps:')
    console.log('  1. Test connection:')
    console.log('     npx tsx scripts/later/test-connection.ts')
    console.log('')
    console.log('  2. Configure a project:')
    console.log('     npx tsx scripts/later/configure-project.ts "Project Name" acc_xxxxx')
    console.log('')
  }
}

setup()
