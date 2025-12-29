/**
 * Generate Later Webhook Secret
 *
 * This script generates a secure random webhook secret for Later integration.
 *
 * Usage:
 *   npx tsx scripts/later/generate-webhook-secret.ts
 */

import crypto from 'crypto'

function generateWebhookSecret() {
  console.log('\n' + '='.repeat(80))
  console.log('🔐 GENERATE LATER WEBHOOK SECRET')
  console.log('='.repeat(80) + '\n')

  // Generate a secure random 32-byte hex string
  const secret = crypto.randomBytes(32).toString('hex')

  console.log('Generated webhook secret:')
  console.log('')
  console.log('  ' + secret)
  console.log('')
  console.log('='.repeat(80))
  console.log('📝 NEXT STEPS:')
  console.log('='.repeat(80))
  console.log('')
  console.log('1. Add this secret to your .env file:')
  console.log('')
  console.log('   LATER_WEBHOOK_SECRET=' + secret)
  console.log('')
  console.log('2. Configure webhook in Later dashboard:')
  console.log('   - Go to: https://app.getlate.dev/settings/webhooks')
  console.log('   - Add webhook URL: https://your-domain.com/api/webhooks/later')
  console.log('   - Paste the secret above')
  console.log('   - Select events: post.scheduled, post.published, post.failed')
  console.log('')
  console.log('3. Restart your server after updating .env')
  console.log('')
  console.log('='.repeat(80) + '\n')
}

generateWebhookSecret()
