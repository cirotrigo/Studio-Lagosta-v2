#!/usr/bin/env node
/**
 * Script to migrate posts with VERIFYING status to POSTED
 *
 * This script updates all SocialPost records with status VERIFYING to POSTED
 * since the VERIFYING status is no longer used (verification is handled by verificationStatus field)
 *
 * Usage:
 *   npm run migrate-verifying-status
 */

import { db } from '../lib/db'

async function main() {
  console.log('🔄 Migrating VERIFYING status to POSTED...\n')

  try {
    // Count posts with VERIFYING status
    const countResult = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "SocialPost"
      WHERE status = 'VERIFYING'
    `

    const count = Number(countResult[0]?.count || 0)

    if (count === 0) {
      console.log('✓ No posts with VERIFYING status found. Nothing to migrate.')
      return
    }

    console.log(`Found ${count} post(s) with VERIFYING status`)

    // Update posts
    const result = await db.$executeRaw`
      UPDATE "SocialPost"
      SET status = 'POSTED', "updatedAt" = NOW()
      WHERE status = 'VERIFYING'
    `

    console.log(`✓ Successfully updated ${result} post(s) from VERIFYING to POSTED\n`)
    console.log('You can now safely remove the VERIFYING value from the PostStatus enum.')
  } catch (error) {
    console.error('❌ Error migrating statuses:', error)
    throw error
  }
}

main()
  .then(() => {
    console.log('\n✓ Migration complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  })
