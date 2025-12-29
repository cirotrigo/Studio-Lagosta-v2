/**
 * Test Later API - Update Post
 * Tests updating an existing post in Later
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(__dirname, '../../.env') })

import { getLaterClient } from '@/lib/later'

async function testUpdatePost() {
  console.log('🧪 Testing Later API - Update Post\n')

  const laterClient = getLaterClient()

  // You need to provide a real Later post ID to test
  const testPostId = process.argv[2]

  if (!testPostId) {
    console.error('❌ Error: Please provide a Later post ID as argument')
    console.log('Usage: npx tsx scripts/later/test-update-post.ts <postId>')
    console.log('\nTo find a post ID, check the laterPostId field in your database:')
    console.log('  SELECT id, laterPostId, caption FROM "SocialPost" WHERE "laterPostId" IS NOT NULL LIMIT 5;')
    process.exit(1)
  }

  console.log(`📝 Testing update for Later post: ${testPostId}\n`)

  try {
    // First, get the current post to see its structure
    console.log('1️⃣ Fetching current post...')
    const currentPost = await laterClient.getPost(testPostId)
    console.log('Current post:', JSON.stringify(currentPost, null, 2))

    // Test 1: Update caption only
    console.log('\n2️⃣ Testing caption update...')
    try {
      const updatePayload = {
        text: `${currentPost.text || ''} [TESTE ATUALIZAÇÃO]`,
      }
      console.log('Update payload:', updatePayload)

      const updated = await laterClient.updatePost(testPostId, updatePayload)
      console.log('✅ Caption update successful!')
      console.log('Updated post:', JSON.stringify(updated, null, 2))
    } catch (error: any) {
      console.error('❌ Caption update failed:', error.message)
      if (error.response) {
        console.error('Response:', error.response)
      }
    }

    // Test 2: Update scheduled time
    console.log('\n3️⃣ Testing scheduled time update...')
    try {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(15, 0, 0, 0)

      const updatePayload = {
        publishAt: tomorrow.toISOString(),
      }
      console.log('Update payload:', updatePayload)

      const updated = await laterClient.updatePost(testPostId, updatePayload)
      console.log('✅ Scheduled time update successful!')
      console.log('Updated post:', JSON.stringify(updated, null, 2))
    } catch (error: any) {
      console.error('❌ Scheduled time update failed:', error.message)
      if (error.response) {
        console.error('Response:', error.response)
      }
    }

    // Test 3: Try different field names
    console.log('\n4️⃣ Testing alternative field names...')

    const alternativeFields = [
      { content: 'Testing content field' },
      { caption: 'Testing caption field' },
      { scheduledFor: new Date(Date.now() + 86400000).toISOString() },
      { scheduleTime: new Date(Date.now() + 86400000).toISOString() },
    ]

    for (const payload of alternativeFields) {
      try {
        console.log(`\nTrying payload:`, payload)
        const updated = await laterClient.updatePost(testPostId, payload as any)
        console.log(`✅ Success with:`, Object.keys(payload)[0])
        console.log('Response:', JSON.stringify(updated, null, 2))
      } catch (error: any) {
        console.log(`❌ Failed with:`, Object.keys(payload)[0], '-', error.message)
      }
    }

    console.log('\n✅ Test complete!')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

testUpdatePost()
