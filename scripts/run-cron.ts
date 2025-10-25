#!/usr/bin/env tsx
/**
 * Script to manually trigger the cron job for processing scheduled posts
 * Usage: npm run cron:posts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const CRON_SECRET = process.env.CRON_SECRET
if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET not found in environment variables')
  console.error('💡 Make sure .env.local has CRON_SECRET defined')
  process.exit(1)
}
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'

async function runCron() {
  console.log('🚀 Triggering cron job for scheduled posts...')
  console.log(`📍 URL: ${BASE_URL}/api/cron/posts`)

  try {
    const response = await fetch(`${BASE_URL}/api/cron/posts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Cron job failed:', response.status, error)
      process.exit(1)
    }

    const result = await response.json()
    console.log('✅ Cron job completed successfully!')
    console.log('📊 Result:', JSON.stringify(result, null, 2))

    if (result.scheduled?.processed > 0) {
      console.log(`\n📨 Scheduled posts processed: ${result.scheduled.processed}`)
      console.log(`   ✅ Success: ${result.scheduled.success}`)
      console.log(`   ❌ Failed: ${result.scheduled.failed}`)
    } else {
      console.log('\n📭 No scheduled posts to process at this time')
    }

    if (result.retries?.processed > 0) {
      console.log(`\n🔄 Retries processed: ${result.retries.processed}`)
    }

  } catch (error) {
    console.error('❌ Error running cron job:', error)
    process.exit(1)
  }
}

runCron()
