/**
 * TypeScript interfaces for Later API
 * API Documentation: https://docs.getlate.dev
 */

/**
 * Later Account represents a social media account connected to Later
 */
export interface LaterAccount {
  _id: string // MongoDB ID (use as Account ID)
  id?: string // Normalized ID (will be set to _id)
  platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'pinterest' | 'tiktok'
  username: string
  platformUserId: string // Platform-specific user ID
  profileId: {
    _id: string
    name: string
  } | string // Can be object or string
  displayName?: string
  profilePicture?: string
  profileUrl?: string
  isActive: boolean
  metadata?: {
    profileData?: {
      followersCount?: number
      followingCount?: number
      postsCount?: number
    }
  }
  createdAt?: string // ISO timestamp
  updatedAt?: string // ISO timestamp
}

/**
 * Later Media Upload represents an uploaded media file
 */
export interface LaterMediaUpload {
  id: string
  url: string // Temporary or permanent URL of uploaded media
  type: 'image' | 'video'
  filename?: string
  width?: number
  height?: number
  size?: number // File size in bytes
  duration?: number // Video duration in seconds
  thumbnailUrl?: string
  uploadedAt?: string // ISO timestamp
}

/**
 * Later Post Status
 */
export type LaterPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'

/**
 * Instagram-specific content types
 */
export type InstagramContentType = 'post' | 'story' | 'reel' | 'carousel'

/**
 * Platform-specific data for Instagram posts
 */
export interface InstagramPlatformData {
  contentType?: InstagramContentType
  firstComment?: string
  location?: {
    id: string
    name: string
  }
  userTags?: Array<{
    username: string
    x: number // 0-1
    y: number // 0-1
  }>
}

/**
 * Platform-specific configuration
 */
export interface PlatformSpecificData {
  instagram?: InstagramPlatformData
  // Other platforms can be added here
}

/**
 * Later Post represents a post created in Later
 */
export interface LaterPost {
  id: string
  text: string // Caption/text content
  status: LaterPostStatus
  accounts: LaterAccount[] // Accounts this post is scheduled for
  mediaIds?: string[] // IDs of uploaded media
  media?: LaterMediaUpload[] // Full media objects (if included)
  publishAt?: string // ISO timestamp - when to publish
  publishedAt?: string // ISO timestamp - when it was published
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  errors?: string[] // Error messages if status is 'failed'
  platformSpecificData?: PlatformSpecificData
  permalink?: string // Public URL after publishing
  platformPostId?: string // Platform's native post ID (e.g., Instagram media_id)
}

/**
 * Payload for creating a new Later post
 * Based on Later API v1 documentation
 */
export interface CreateLaterPostPayload {
  content?: string // Post text/caption (optional for Stories)
  platforms: Array<{
    platform: string // e.g., "instagram", "twitter", etc.
    accountId: string // Later account ID
    platformSpecificData?: {
      contentType?: 'post' | 'story' | 'reel' | 'carousel'
    } // Platform-specific settings (MUST be inside platform object!)
  }> // Platforms to post to (required)
  mediaItems?: Array<{
    type?: 'image' | 'video'
    url: string // Media URL (required)
  }> // Media files (optional but required for Instagram)
  scheduledFor?: string // ISO 8601 timestamp (optional - publishes now if not provided)
  publishNow?: boolean // Publish immediately (optional)
  timezone?: string // Timezone for scheduling (default: UTC)
}

/**
 * Payload for updating an existing Later post
 * Only posts with status: draft, scheduled, failed, or partial can be edited
 * Posts with status: published, publishing, or cancelled CANNOT be edited
 */
export interface UpdateLaterPostPayload {
  content?: string // Post text/caption
  scheduledFor?: string // ISO 8601 timestamp
  title?: string // Post title
  mediaItems?: Array<{
    type?: 'image' | 'video'
    url: string
  }> // Update media files
  platforms?: Array<{
    platform: string
    accountId: string
    platformSpecificData?: {
      contentType?: 'post' | 'story' | 'reel' | 'carousel'
    }
  }> // Update platforms
  timezone?: string // Timezone for scheduling
}

/**
 * Later API List Response (generic)
 */
export interface LaterListResponse<T> {
  data: T[]
  pagination?: {
    total: number
    page: number
    perPage: number
    totalPages: number
  }
}

/**
 * Later API Error Response
 */
export interface LaterErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * Later Webhook Event Types
 */
export type LaterWebhookEventType =
  | 'post.scheduled'
  | 'post.published'
  | 'post.failed'
  | 'post.deleted'

/**
 * Later Webhook Payload
 */
export interface LaterWebhookPayload {
  event: LaterWebhookEventType
  timestamp: string // ISO timestamp
  data: {
    postId: string
    accountId: string
    status: LaterPostStatus
    publishedAt?: string
    permalink?: string
    platformPostId?: string
    errors?: string[]
    [key: string]: unknown // Allow additional fields
  }
}

/**
 * Media Upload Options
 */
export interface MediaUploadOptions {
  filename?: string
  contentType?: string
}

/**
 * Later API Rate Limit Info
 */
export interface RateLimitInfo {
  limit: number // Total requests allowed per window
  remaining: number // Requests remaining in current window
  reset: number // Unix timestamp when the limit resets
  retryAfter?: number // Seconds to wait before retrying (for 429 responses)
}

/**
 * Later Client Configuration
 */
export interface LaterClientConfig {
  apiKey: string
  baseUrl?: string // Default: https://getlate.dev/api/v1
  timeout?: number // Request timeout in ms (default: 30000)
  retryAttempts?: number // Number of retry attempts for failed requests (default: 3)
}

// =============================================================================
// ANALYTICS TYPES (requires Analytics add-on $10/month)
// =============================================================================

/**
 * Analytics response from Later API
 * GET /api/v1/analytics
 * Requires Analytics add-on ($10/month)
 */
export interface LaterAnalyticsResponse {
  posts: LaterPostAnalytics[]
  overview?: {
    totalPosts: number
    totalLikes: number
    totalComments: number
    avgEngagement: number
  }
  pagination?: {
    page: number
    limit: number
    total: number
  }
}

/**
 * Analytics for a single post
 */
export interface LaterPostAnalytics {
  postId: string
  platform: string
  publishedAt: string
  platformPostUrl?: string
  metrics: {
    likes: number
    comments: number
    shares?: number
    impressions?: number
    reach?: number
    engagement: number // likes + comments + shares
    engagementRate?: number // engagement / reach
  }
}

/**
 * Parameters for analytics query
 */
export interface AnalyticsQueryParams {
  platform?: 'instagram' | 'all'
  profileId?: string // Filter by profile
  fromDate?: string // ISO date '2025-01-01'
  toDate?: string // ISO date '2025-01-31'
  limit?: number // Max 100
  page?: number
  sortBy?: 'date' | 'engagement'
  order?: 'asc' | 'desc'
  postId?: string // Get analytics for specific post
}
