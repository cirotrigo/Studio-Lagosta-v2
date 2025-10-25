#!/usr/bin/env tsx
/**
 * Script to clean up failed/stuck retries from the database
 * This fixes the performance issue caused by infinite retry loops
 * Usage: npm run cleanup:retries
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { db } from '../src/lib/db'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

async function cleanupRetries() {
  console.log('🔍 Analyzing retry records...')

  try {
    // Count pending retries
    const pendingCount = await db.postRetry.count({
      where: { status: 'PENDING' },
    })

    // Count processing retries (stuck)
    const processingCount = await db.postRetry.count({
      where: { status: 'PROCESSING' },
    })

    // Count failed retries
    const failedCount = await db.postRetry.count({
      where: { status: 'FAILED' },
    })

    // Count total
    const total = await db.postRetry.count()

    console.log('\n📊 Current state:')
    console.log(`   Total retries: ${total}`)
    console.log(`   Pending: ${pendingCount}`)
    console.log(`   Processing (stuck): ${processingCount}`)
    console.log(`   Failed: ${failedCount}`)

    if (pendingCount === 0 && processingCount === 0 && failedCount === 0) {
      console.log('\n✅ No retries to clean up!')
      return
    }

    console.log('\n🧹 Cleaning up problematic retries...')

    // Update stuck PROCESSING retries to FAILED
    if (processingCount > 0) {
      const stuckResult = await db.postRetry.updateMany({
        where: { status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          errorMessage: 'Stuck in processing state - marked as failed by cleanup script',
        },
      })
      console.log(`   ✓ Marked ${stuckResult.count} stuck retries as FAILED`)
    }

    // Delete ALL failed retries (they're already failed, no point keeping them)
    const deletedFailed = await db.postRetry.deleteMany({
      where: {
        status: 'FAILED',
      },
    })
    console.log(`   ✓ Deleted ${deletedFailed.count} FAILED retries`)

    // Delete ALL pending retries older than 10 minutes (if they're stuck, they won't succeed)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const deletedOldPending = await db.postRetry.deleteMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lt: tenMinutesAgo },
      },
    })
    console.log(`   ✓ Deleted ${deletedOldPending.count} old PENDING retries`)

    // Delete pending retries that have exhausted attempts
    const deletedExhausted = await db.postRetry.deleteMany({
      where: {
        status: 'PENDING',
        attemptNumber: { gte: 3 },
      },
    })
    console.log(`   ✓ Deleted ${deletedExhausted.count} exhausted PENDING retries (attempt >= 3)`)

    console.log('\n✅ Cleanup completed!')

    // Show final state
    const finalTotal = await db.postRetry.count()
    const finalPending = await db.postRetry.count({ where: { status: 'PENDING' } })

    console.log('\n📊 Final state:')
    console.log(`   Total retries: ${finalTotal}`)
    console.log(`   Pending: ${finalPending}`)

    if (finalPending > 0) {
      console.log('\n⚠️  There are still pending retries. These are recent and will be processed normally.')
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

cleanupRetries()
