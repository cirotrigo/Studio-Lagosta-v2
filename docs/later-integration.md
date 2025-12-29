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
- ✅ **Media Upload** - Upload images/videos from URLs or buffers
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
LATER_WEBHOOK_SECRET=your_webhook_secret_here
ENABLE_LATER=false
```

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
// Upload from URL
const media = await client.uploadMediaFromUrl(
  'https://example.com/image.jpg'
)

console.log('Uploaded media:', media.id)
// media_789
```

### Create Post

```typescript
// Create immediate post
const post = await client.createPost({
  text: 'Check out our new design! 🎨',
  accounts: ['acc_123'],
  mediaIds: [media.id],
})

console.log('Post created:', post.id, post.status)
// post_abc, 'publishing'
```

### Create Scheduled Post

```typescript
const scheduledPost = await client.createPost({
  text: 'Coming soon! 🚀',
  accounts: ['acc_123'],
  mediaIds: [media.id],
  publishAt: new Date('2024-12-30T14:00:00Z').toISOString(),
})

console.log('Scheduled for:', scheduledPost.publishAt)
```

### Create Post with Media (One Step)

```typescript
const post = await client.createPostWithMedia(
  {
    text: 'New artwork! 🎨',
    accounts: ['acc_123'],
    publishAt: new Date('2024-12-30T15:00:00Z').toISOString(),
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
  payload: Omit<CreateLaterPostPayload, 'mediaIds'>,
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
  text: string
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
  accounts: LaterAccount[]
  mediaIds?: string[]
  publishAt?: string // ISO timestamp
  publishedAt?: string // ISO timestamp
  errors?: string[]
  permalink?: string
  platformPostId?: string
}
```

#### CreateLaterPostPayload

```typescript
interface CreateLaterPostPayload {
  text: string // Caption (required)
  accounts: string[] // Account IDs (required)
  mediaIds?: string[] // Media IDs (optional)
  publishAt?: string // ISO timestamp (optional)
  platformSpecificData?: {
    instagram?: {
      contentType?: 'post' | 'story' | 'reel' | 'carousel'
      firstComment?: string
    }
  }
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
  // { text: ['Caption is required'], accounts: ['At least one account required'] }
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
      text: caption,
      accounts: ['acc_lagostacriativa'],
      mediaIds: [media.id],
      platformSpecificData: {
        instagram: {
          contentType: 'story',
        },
      },
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
    // Upload all images
    const mediaUploads = await client.uploadMultipleMedia(imageUrls)

    // Create carousel post
    const post = await client.createPost({
      text: caption,
      accounts: ['acc_lagostacriativa'],
      mediaIds: mediaUploads.map((m) => m.id),
      platformSpecificData: {
        instagram: {
          contentType: 'carousel',
        },
      },
    })

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
    const post = await client.createPostWithMedia(
      {
        text: caption,
        accounts: ['acc_lagostacriativa'],
        publishAt: publishDate.toISOString(),
        platformSpecificData: {
          instagram: {
            contentType: 'reel',
          },
        },
      },
      [videoUrl]
    )

    console.log('✅ Reel scheduled for:', post.publishAt)
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

#### 4. Validation Error (422)

**Problem:** `LaterValidationError: Validation failed`

**Solutions:**
- Check required fields: `text`, `accounts`
- Verify account IDs exist
- Ensure media IDs are valid
- Check date format for `publishAt` (ISO 8601)

#### 5. Account Not Found (404)

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
  // Logs are automatically enabled in the client
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

### Phase 3: Implement LaterPostScheduler

After completing Phases 1 & 2, the next step is to implement the `LaterPostScheduler` class that integrates this client with the existing post scheduling system.

**Key Tasks:**

1. Create `/src/lib/posts/later-scheduler.ts`
2. Implement dual-mode routing in `PostScheduler`
3. Map `PostType` to Instagram content types
4. Handle verification tags for stories
5. Add logging and error tracking

**Reference:** See `/prompts/plano-later.md` for detailed implementation plan.

### Phase 4: Webhooks

Implement webhook handling for Later events:

- `post.published` - Update status to POSTED
- `post.failed` - Update status to FAILED
- `post.scheduled` - Confirmation of scheduling

**Endpoint:** `/api/webhooks/later/route.ts`

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

**Last Updated:** 2024-12-28
**Version:** 1.0 (Phases 1 & 2 Complete)
