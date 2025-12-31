/**
 * Manually Execute Post
 * Triggers the executor to process a specific post immediately
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PostExecutor } from '../src/lib/posts/executor'

async function executePost() {
  console.log('\n' + '='.repeat(80))
  console.log('🚀 MANUAL POST EXECUTION')
  console.log('='.repeat(80) + '\n')

  const executor = new PostExecutor()

  try {
    console.log('⏰ Running scheduled posts executor...\n')
    const result = await executor.executeScheduledPosts()

    console.log('\n' + '='.repeat(80))
    console.log('📊 EXECUTION RESULT:')
    console.log('='.repeat(80))
    console.log(`   Total processed: ${result.processed}`)
    console.log(`   Successful: ${result.success || 0}`)
    console.log(`   Failed: ${result.failed || 0}`)
    console.log(`   Catch-up: ${result.catchUp || 0}`)
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ EXECUTION FAILED:', error)
    process.exit(1)
  }
}

executePost()
