# Later API Integration

Complete guide for using the Later API client in Studio Lagosta v2.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Overview

The Later API integration provides a modern alternative to the Zapier/Buffer posting workflow. It allows direct scheduling and publishing of Instagram posts via the Later API.

### Key Features

- ✅ **Direct API Integration** - No intermediary services required
- ✅ **Dual-Mode Support** - Run Later and Zapier/Buffer simultaneously
- ✅ **Type-Safe Client** - Full TypeScript support
- ✅ **Robust Error Handling** - Comprehensive error classes
- ✅ **Rate Limit Detection** - Automatic rate limit tracking
- ✅ **Presigned Media Upload** - Reliable uploads via `/media/presign` to avoid 413 errors
- ✅ **Batch Operations** - Upload multiple media files in parallel

### Architecture

```
src/lib/later/
├── client.ts          # Main HTTP client
├── types.ts           # TypeScript interfaces
├── errors.ts          # Custom error classes
├── media-upload.ts    # Media utilities
└── index.ts           # Public exports
```

---

## Setup

### 1. Get Later API Key

1. Sign up for a Later account at [getlate.dev](https://getlate.dev)
2. Navigate to Settings → API
3. Generate a new API key
4. Copy the key

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# Later API Integration
LATER_API_KEY=your_api_key_here
# Webhook verification (recommended in production)
LATE_WEBHOOK_SECRET=your_webhook_secret_here
# Cron auth for scheduled posts (recommended in production)
CRON_SECRET=your_cron_secret_here
```

**Note:** `LATER_WEBHOOK_SECRET` is still accepted for backward compatibility, but prefer `LATE_WEBHOOK_SECRET`.

### 3. Connect Instagram Account

1. In Later dashboard, connect your Instagram account
2. Note the account ID (visible in URL or API response)
3. Update your project in database:

```sql
UPDATE "Project"
SET
  "laterAccountId" = 'acc_xxxxx',
  "laterProfileId" = 'prf_xxxxx',
  "postingProvider" = 'LATER'
WHERE "name" = 'Your Project Name';
```

---

## Basic Usage

### Import the Client

```typescript
import { LaterClient, getLaterClient } from '@/lib/later'
```

### Initialize Client

```typescript
// Option 1: Create new instance
const client = new LaterClient({
  apiKey: process.env.LATER_API_KEY,
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
})

// Option 2: Use singleton (recommended)
const client = getLaterClient()
```

### List Accounts

```typescript
const accounts = await client.listAccounts()

console.log('Connected accounts:', accounts)
// [
//   {
//     id: 'acc_123',
//     platform: 'instagram',
//     username: '@lagostacriativa',
//     profileId: 'ig_456',
//     isActive: true
//   }
// ]
```

### Upload Media

```typescript
// Upload from URL (uses /media/presign under the hood)
const media = await client.uploadMediaFromUrl(
  'https://example.com/image.jpg'
)

console.log('Uploaded media:', media.url)
// https://media.getlate.dev/media/...
```

### Create Post

```typescript
// Create immediate post
const post = await client.createPost({
  content: 'Check out our new design! 🎨',
  mediaItems: [{ type: 'image', url: media.url }],
  platforms: [{ platform: 'instagram', accountId: 'acc_123' }],
  publishNow: true,
})

console.log('Post created:', post.id, post.status)
// post_abc, 'published' | 'publishing'
```

### Create Scheduled Post

```typescript
const scheduledPost = await client.createPost({
  content: 'Coming soon! 🚀',
  mediaItems: [{ type: 'image', url: media.url }],
  platforms: [{ platform: 'instagram', accountId: 'acc_123' }],
  scheduledFor: new Date('2024-12-30T14:00:00Z').toISOString(),
  timezone: 'America/Sao_Paulo',
})

console.log('Scheduled for:', scheduledPost.scheduledFor)
```

### Create Post with Media (One Step)

```typescript
const post = await client.createPostWithMedia(
  {
    content: 'New artwork! 🎨',
    platforms: [{ platform: 'instagram', accountId: 'acc_123' }],
    publishNow: true,
  },
  [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg',
  ]
)

console.log('Post created with media:', post.id)
```

---

## Media Upload Strategy (Presigned URLs)

To avoid `413 Request Entity Too Large` and intermittent `Media fetch failed`, the client uses the
Late presign flow for uploads:

1. `POST /media/presign` with `filename`, `contentType`, and `size`
2. `PUT` the file buffer directly to `uploadUrl`
3. Use the returned `publicUrl` in `mediaItems`

This flow is implemented in:
- `LaterClient.uploadMediaFromUrl`
- `LaterClient.uploadMediaFromBuffer`

`createPostWithMedia(...)` always uses this flow.

---

## Production Checklist

- ✅ Deploy code with presigned upload support (`src/lib/later/client.ts`).
- ✅ Set `LATER_API_KEY` in the production environment.
- ✅ Set `LATE_WEBHOOK_SECRET` in production to verify webhooks.
- ✅ Set `CRON_SECRET` if you use `/api/cron/posts`.
- ✅ Configure the webhook in Late: `/api/webhooks/late`.
- ✅ Ensure `next.config.ts` allows external image hosts used by posts.

---

## Security & Logging

- Never log raw Later API responses in production (they may include tokens).
- The client now logs a **sanitized response summary** only.
- If deep debugging is needed, instrument logs locally and remove before deploy.
- Rotate keys immediately if any token or API key appears in logs.

---

## API Reference

### LaterClient

Main client class for Later API interactions.

#### Constructor

```typescript
new LaterClient(config?: Partial<LaterClientConfig>)
```

**Config Options:**

| Option         | Type   | Default                         | Description                     |
| -------------- | ------ | ------------------------------- | ------------------------------- |
| `apiKey`       | string | `process.env.LATER_API_KEY`     | Later API key                   |
| `baseUrl`      | string | `https://getlate.dev/api/v1`    | API base URL                    |
| `timeout`      | number | `30000`                         | Request timeout (ms)            |
| `retryAttempts`| number | `3`                             | Number of retry attempts        |

#### Methods

##### Accounts

```typescript
// List all accounts
listAccounts(): Promise<LaterAccount[]>

// Get specific account
getAccount(accountId: string): Promise<LaterAccount>
```

##### Media Upload

```typescript
// Upload from URL
uploadMediaFromUrl(
  url: string,
  options?: MediaUploadOptions
): Promise<LaterMediaUpload>

// Upload from Buffer
uploadMediaFromBuffer(
  buffer: Buffer,
  options: MediaUploadOptions
): Promise<LaterMediaUpload>

// Batch upload
uploadMultipleMedia(urls: string[]): Promise<LaterMediaUpload[]>
```

##### Posts

```typescript
// Create post
createPost(payload: CreateLaterPostPayload): Promise<LaterPost>

// Get post
getPost(postId: string): Promise<LaterPost>

// Update post
updatePost(
  postId: string,
  payload: UpdateLaterPostPayload
): Promise<LaterPost>

// Delete post
deletePost(postId: string): Promise<void>

// Schedule post
schedulePost(
  postId: string,
  publishAt: Date | string
): Promise<LaterPost>

// Publish immediately
publishPost(postId: string): Promise<LaterPost>
```

##### Convenience Methods

```typescript
// Create post with media upload in one step
createPostWithMedia(
  payload: Omit<CreateLaterPostPayload, 'mediaItems'>,
  mediaUrls: string[]
): Promise<LaterPost>
```

### Types

#### LaterAccount

```typescript
interface LaterAccount {
  id: string
  platform: 'instagram' | 'facebook' | 'twitter' | ...
  username: string
  profileId: string
  displayName?: string
  avatarUrl?: string
  isActive: boolean
}
```

#### LaterMediaUpload

```typescript
interface LaterMediaUpload {
  id: string
  url: string
  type: 'image' | 'video'
  filename?: string
  width?: number
  height?: number
}
```

#### LaterPost

```typescript
interface LaterPost {
  id: string
  content: string
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
  platforms: Array<{
    platform: string
    accountId: string
    status?: string
    platformPostId?: string
    platformPostUrl?: string
  }>
  mediaItems?: Array<{ type: 'image' | 'video'; url: string }>
  scheduledFor?: string // ISO timestamp
  publishedAt?: string // ISO timestamp
  errors?: string[]
  permalink?: string
  platformPostId?: string
}
```

#### CreateLaterPostPayload

```typescript
interface CreateLaterPostPayload {
  content?: string // Caption (optional for Stories)
  platforms: Array<{
    platform: string
    accountId: string
    platformSpecificData?: {
      contentType?: 'post' | 'story' | 'reel' | 'carousel'
    }
  }>
  mediaItems?: Array<{ type?: 'image' | 'video'; url: string }>
  scheduledFor?: string // ISO timestamp (optional)
  publishNow?: boolean // Publish immediately (optional)
  timezone?: string // Timezone for scheduling (optional)
}
```

---

## Error Handling

The client provides comprehensive error handling with custom error classes.

### Error Types

#### LaterApiError

Base error class for all Later API errors.

```typescript
try {
  await client.createPost(payload)
} catch (error) {
  if (error instanceof LaterApiError) {
    console.error('API Error:', error.statusCode, error.message)
    console.error('Error code:', error.errorCode)
    console.error('Details:', error.errorDetails)
  }
}
```

#### LaterRateLimitError

Rate limit exceeded (HTTP 429).

```typescript
try {
  await client.createPost(payload)
} catch (error) {
  if (error instanceof LaterRateLimitError) {
    console.error('Rate limit exceeded!')
    console.error('Retry after:', error.retryAfterSeconds, 'seconds')
    console.error('Resets at:', error.resetAt)

    // Wait and retry
    await new Promise((resolve) =>
      setTimeout(resolve, error.retryAfterSeconds * 1000)
    )
  }
}
```

#### LaterAuthError

Authentication failed (HTTP 401).

```typescript
if (error instanceof LaterAuthError) {
  console.error('Invalid API key')
  // Update API key in environment
}
```

#### LaterNotFoundError

Resource not found (HTTP 404).

```typescript
if (error instanceof LaterNotFoundError) {
  console.error('Post not found:', error.resourceId)
}
```

#### LaterValidationError

Validation failed (HTTP 422).

```typescript
if (error instanceof LaterValidationError) {
  console.error('Validation errors:', error.validationErrors)
  // { content: ['Caption is required'], platforms: ['At least one platform required'] }
}
```

#### LaterMediaUploadError

Media upload failed.

```typescript
if (error instanceof LaterMediaUploadError) {
  console.error('Failed to upload:', error.mediaUrl)
}
```

#### LaterNetworkError

Network or timeout error.

```typescript
if (error instanceof LaterNetworkError) {
  console.error('Network error:', error.message)
  // Retry request
}
```

### Error Helpers

```typescript
import { isLaterApiError, isRateLimitError, getErrorMessage } from '@/lib/later'

if (isLaterApiError(error)) {
  // Handle API error
}

if (isRateLimitError(error)) {
  // Handle rate limit
}

const message = getErrorMessage(error) // Safe message extraction
```

---

## Examples

### Example 1: Create Story

```typescript
import { getLaterClient } from '@/lib/later'

async function createStory(imageUrl: string, caption: string) {
  const client = getLaterClient()

  try {
    // Upload media
    const media = await client.uploadMediaFromUrl(imageUrl)

    // Create story
    const post = await client.createPost({
      content: caption,
      mediaItems: [{ type: 'image', url: media.url }],
      platforms: [
        {
          platform: 'instagram',
          accountId: 'acc_lagostacriativa',
          platformSpecificData: { contentType: 'story' },
        },
      ],
      publishNow: true,
    })

    console.log('✅ Story created:', post.id)
    return post
  } catch (error) {
    console.error('❌ Failed to create story:', error)
    throw error
  }
}
```

### Example 2: Create Carousel

```typescript
async function createCarousel(imageUrls: string[], caption: string) {
  const client = getLaterClient()

  try {
    // Upload + create in one step (carousel inferred by multiple items)
    const post = await client.createPostWithMedia(
      {
        content: caption,
        platforms: [{ platform: 'instagram', accountId: 'acc_lagostacriativa' }],
        publishNow: true,
      },
      imageUrls
    )

    console.log('✅ Carousel created:', post.id)
    return post
  } catch (error) {
    console.error('❌ Failed to create carousel:', error)
    throw error
  }
}
```

### Example 3: Schedule Reel

```typescript
async function scheduleReel(
  videoUrl: string,
  caption: string,
  publishDate: Date
) {
  const client = getLaterClient()

  try {
    const post = await client.createPost({
      content: caption,
      mediaItems: [{ type: 'video', url: videoUrl }],
      platforms: [
        {
          platform: 'instagram',
          accountId: 'acc_lagostacriativa',
          platformSpecificData: { contentType: 'reel' },
        },
      ],
      scheduledFor: publishDate.toISOString(),
      timezone: 'America/Sao_Paulo',
    })

    console.log('✅ Reel scheduled for:', post.scheduledFor)
    return post
  } catch (error) {
    console.error('❌ Failed to schedule reel:', error)
    throw error
  }
}
```

### Example 4: Check Post Status

```typescript
async function checkPostStatus(postId: string) {
  const client = getLaterClient()

  try {
    const post = await client.getPost(postId)

    console.log('Post status:', post.status)

    if (post.status === 'published') {
      console.log('Published at:', post.publishedAt)
      console.log('Permalink:', post.permalink)
    } else if (post.status === 'failed') {
      console.error('Errors:', post.errors)
    }

    return post
  } catch (error) {
    console.error('❌ Failed to get post:', error)
    throw error
  }
}
```

### Example 5: Rate Limit Handling

```typescript
import { isRateLimitError } from '@/lib/later'

async function createPostWithRetry(payload: CreateLaterPostPayload) {
  const client = getLaterClient()
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const post = await client.createPost(payload)
      return post
    } catch (error) {
      if (isRateLimitError(error)) {
        if (attempt === maxRetries) {
          throw error // Give up after max retries
        }

        console.log(
          `Rate limited. Waiting ${error.retryAfterSeconds}s before retry ${attempt}/${maxRetries}`
        )

        await new Promise((resolve) =>
          setTimeout(resolve, error.retryAfterSeconds * 1000)
        )
        continue
      }

      throw error // Non-rate-limit error, don't retry
    }
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. Authentication Error (401)

**Problem:** `LaterAuthError: Authentication failed`

**Solutions:**
- Verify `LATER_API_KEY` is set in `.env`
- Check API key is valid in Later dashboard
- Ensure key has not expired

#### 2. Rate Limit Error (429)

**Problem:** `LaterRateLimitError: Rate limit exceeded`

**Solutions:**
- Later FREE plan: 60 req/min
- Implement request queuing
- Add exponential backoff
- Upgrade to BUILD plan if needed

#### 3. Media Upload Failed

**Problem:** `LaterMediaUploadError: Failed to upload media`

**Solutions:**
- Verify media URL is accessible
- Check media file size (Images: 8MB, Videos: 100MB)
- Ensure media format is supported (JPG, PNG, MP4, etc.)
- Check network connectivity
- If you see `413 Request Entity Too Large`, ensure the client is using `/media/presign` (default).

#### 4. Media fetch failed (Instagram/Late)

**Problem:** `Media fetch failed, please try again.`

**Solutions:**
- For images, use presigned uploads (`createPostWithMedia` or `uploadMediaFromUrl`)
- For videos, ensure the URL is public and stable (no auth, no expiring URLs)
- Confirm the media URL is reachable from the public internet

#### 5. Validation Error (422)

**Problem:** `LaterValidationError: Validation failed`

**Solutions:**
- Check required fields: `content`, `platforms`, `mediaItems`
- Verify account IDs exist
- Ensure media URLs are valid and public
- Check date format for `scheduledFor` (ISO 8601)

#### 6. Account Not Found (404)

**Problem:** `LaterNotFoundError: Resource not found`

**Solutions:**
- Verify account is connected in Later dashboard
- Check account ID is correct
- Ensure account is active

### Debug Mode

Enable detailed logging:

```typescript
const client = new LaterClient({
  apiKey: process.env.LATER_API_KEY,
  // Logs are sanitized by default
})

// Check rate limit info
const rateLimitInfo = client.getRateLimitInfo()
console.log('Rate limit:', rateLimitInfo)
```

### Network Debugging

```typescript
try {
  await client.createPost(payload)
} catch (error) {
  if (error instanceof LaterNetworkError) {
    console.error('Network error details:', {
      message: error.message,
      originalError: error.originalError,
    })
  }
}
```

---

## Next Steps

Later scheduling and webhook handling are already implemented:

- `src/lib/posts/later-scheduler.ts`
- `src/app/api/webhooks/late/route.ts`
- `src/lib/posts/executor.ts` (cron scheduling)

Focus future work on:
- Monitoring and alerting
- Better UI feedback for failed posts
- Additional platform support

### Testing Checklist

- [ ] Test account listing
- [ ] Test media upload (image)
- [ ] Test media upload (video)
- [ ] Test immediate post creation
- [ ] Test scheduled post creation
- [ ] Test story creation
- [ ] Test carousel creation
- [ ] Test reel creation
- [ ] Test error handling (401, 404, 422, 429)
- [ ] Test rate limit handling
- [ ] Test network timeout

---

## Resources

- **Later API Docs:** https://docs.getlate.dev
- **Instagram Docs:** https://docs.getlate.dev/platforms/instagram
- **Webhooks:** https://docs.getlate.dev/webhooks
- **Rate Limits:** https://docs.getlate.dev/rate-limits
- **Migration Plan:** `/prompts/plano-later.md`

---

**Last Updated:** 2026-01-10
**Version:** 2.0 (Presigned uploads + sanitised logs)
