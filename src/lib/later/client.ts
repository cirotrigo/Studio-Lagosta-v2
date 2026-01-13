/**
 * Later API Client
 * Main HTTP client for interacting with the Later API
 * API Documentation: https://docs.getlate.dev
 */

import FormDataNode from 'form-data'
import {
  LaterApiError,
  LaterAuthError,
  LaterAuthorizationError,
  LaterNetworkError,
  LaterNotFoundError,
  LaterRateLimitError,
  LaterValidationError,
  LaterMediaUploadError,
} from './errors'
import {
  detectMediaType,
  fetchMediaAsBuffer,
  prepareUploadOptions,
} from './media-upload'
import type {
  LaterAccount,
  LaterPost,
  CreateLaterPostPayload,
  UpdateLaterPostPayload,
  LaterMediaUpload,
  LaterListResponse,
  LaterErrorResponse,
  RateLimitInfo,
  LaterClientConfig,
  MediaUploadOptions,
  LaterAnalyticsResponse,
  LaterPostAnalytics,
  LaterRawAnalyticsPost,
  LaterAnalyticsData,
  AnalyticsQueryParams,
} from './types'

/**
 * Later API Client
 */
export class LaterClient {
  private apiKey: string
  private baseUrl: string
  private timeout: number
  private retryAttempts: number
  private rateLimitInfo?: RateLimitInfo

  constructor(config?: Partial<LaterClientConfig>) {
    const apiKey = config?.apiKey || process.env.LATER_API_KEY

    if (!apiKey) {
      throw new Error(
        'Later API key is required. Provide it via config or LATER_API_KEY environment variable.'
      )
    }

    this.apiKey = apiKey
    this.baseUrl = config?.baseUrl || 'https://getlate.dev/api/v1'
    this.timeout = config?.timeout || 30000
    this.retryAttempts = config?.retryAttempts || 3
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.rateLimitInfo
  }

  /**
   * Make authenticated HTTP request to Later API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string> || {}),
    }

    // Handle form-data library (FormDataNode)
    if (options.body && options.body instanceof FormDataNode) {
      console.log('[Later Client] 📤 Sending FormData request (form-data library) to:', endpoint)

      // Get headers from form-data (includes Content-Type with boundary)
      const formHeaders = options.body.getHeaders()
      Object.assign(headers, formHeaders)

      console.log('[Later Client] FormData headers:', formHeaders)
    }
    // Handle native FormData (browser/Node.js 20+)
    else if (options.body instanceof FormData) {
      console.log('[Later Client] 📤 Sending native FormData request to:', endpoint)
      // Don't set Content-Type for FormData - let fetch handle it
    }
    // Handle JSON requests
    else if (!(options.body instanceof FormData) && !(options.body instanceof FormDataNode)) {
      headers['Content-Type'] = 'application/json'
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      console.log('[Later Client] 🌐 Making request:', {
        url,
        method: options.method || 'GET',
        hasBody: !!options.body,
        bodyType: options.body?.constructor.name,
        headers: Object.keys(headers),
      })

      const requestInit: RequestInit & { duplex?: 'half' } = {
        ...options,
        headers,
        signal: controller.signal,
      }

      if (options.body && options.body instanceof FormDataNode) {
        // Required by Node.js fetch when streaming multipart bodies.
        requestInit.duplex = 'half'
      }

      const response = await fetch(url, requestInit)

      clearTimeout(timeoutId)

      // Extract rate limit info from headers
      this.updateRateLimitInfo(response.headers)

      // Handle non-OK responses
      if (!response.ok) {
        await this.handleErrorResponse(response)
      }

      // Parse JSON response
      let data
      try {
        data = await response.json()
      } catch (jsonError) {
        // If JSON parsing fails, try to get text
        const text = await response.text()
        console.error('[Later Client] Failed to parse JSON response:', text)
        throw new LaterApiError(
          `Invalid JSON response: ${text.substring(0, 100)}`,
          response.status
        )
      }

      return data as T
    } catch (error) {
      clearTimeout(timeoutId)

      // Re-throw if already a Later error
      if (error instanceof LaterApiError) {
        throw error
      }

      // Handle network/timeout errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LaterNetworkError(
            `Request timeout after ${this.timeout}ms`,
            error
          )
        }
        throw new LaterNetworkError(`Network request failed: ${error.message}`, error)
      }

      throw new LaterNetworkError('Unknown network error', error)
    }
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit')
    const remaining = headers.get('x-ratelimit-remaining')
    const reset = headers.get('x-ratelimit-reset')

    if (limit && remaining && reset) {
      this.rateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      }
    }
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase()
    return (
      normalized === 'accesstoken' ||
      normalized === 'refreshtoken' ||
      normalized === 'api_key' ||
      normalized === 'apikey' ||
      normalized === 'authorization' ||
      normalized === 'secret' ||
      normalized === 'password' ||
      normalized === 'access_token' ||
      normalized === 'refresh_token'
    )
  }

  private redactSensitive(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.redactSensitive(entry))
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const redacted: Record<string, unknown> = {}

      for (const [key, entry] of Object.entries(record)) {
        if (this.isSensitiveKey(key)) {
          redacted[key] = '[REDACTED]'
        } else {
          redacted[key] = this.redactSensitive(entry)
        }
      }

      return redacted
    }

    return value
  }

  private summarizePostResponse(response: unknown): Record<string, unknown> {
    if (!response || typeof response !== 'object') {
      return { response }
    }

    const raw = response as Record<string, unknown>
    const post = (raw.post ?? raw) as Record<string, unknown>

    const platforms = Array.isArray(post.platforms)
      ? post.platforms.map((platform) => {
          if (!platform || typeof platform !== 'object') {
            return platform
          }

          const platformData = platform as Record<string, unknown>
          const accountId =
            typeof platformData.accountId === 'string'
              ? platformData.accountId
              : typeof platformData.accountId === 'object' && platformData.accountId
                ? (platformData.accountId as Record<string, unknown>)._id
                : undefined

          return this.redactSensitive({
            platform: platformData.platform,
            status: platformData.status,
            accountId,
            profileId: platformData.profileId,
            platformPostId: platformData.platformPostId,
            platformPostUrl: platformData.platformPostUrl,
            errorMessage: platformData.errorMessage,
          })
        })
      : undefined

    return this.redactSensitive({
      id: post._id ?? post.id,
      status: post.status,
      scheduledFor: post.scheduledFor,
      publishedAt: post.publishedAt,
      mediaCount: Array.isArray(post.mediaItems) ? post.mediaItems.length : 0,
      platforms,
    }) as Record<string, unknown>
  }

  /**
   * Handle error responses from Later API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const statusCode = response.status

    let errorResponse: LaterErrorResponse | undefined

    try {
      errorResponse = await response.json()
      // Log full error response for debugging
      const sanitized = this.redactSensitive(errorResponse)
      console.error('[Later Client] API Error Response:', JSON.stringify(sanitized, null, 2))
    } catch {
      // If JSON parsing fails, use response text
    }

    const errorMessage =
      errorResponse?.error?.message ||
      response.statusText ||
      'Unknown error occurred'

    // Handle specific status codes
    switch (statusCode) {
      case 401:
        throw new LaterAuthError(errorMessage)

      case 403:
        throw new LaterAuthorizationError(errorMessage)

      case 404:
        throw new LaterNotFoundError(errorMessage)

      case 422:
        const validationErrors = errorResponse?.error?.details as
          | Record<string, string[]>
          | undefined
        throw new LaterValidationError(
          errorMessage,
          validationErrors,
          errorResponse
        )

      case 429:
        const retryAfter = response.headers.get('retry-after')
        const rateLimitInfo: RateLimitInfo = {
          limit: this.rateLimitInfo?.limit || 60,
          remaining: 0,
          reset: this.rateLimitInfo?.reset || Date.now() / 1000 + 60,
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : 60,
        }
        throw new LaterRateLimitError(rateLimitInfo, errorResponse)

      default:
        throw new LaterApiError(errorMessage, statusCode, errorResponse)
    }
  }

  // =============================================================================
  // ACCOUNTS API
  // =============================================================================

  /**
   * List all connected social media accounts
   * GET /accounts
   */
  async listAccounts(): Promise<LaterAccount[]> {
    console.log('[Later Client] Listing accounts')

    const response = await this.request<any>(
      '/accounts'
    )

    // Handle different response formats
    let accounts: LaterAccount[]

    if (Array.isArray(response)) {
      // Response is directly an array
      accounts = response
    } else if (response && typeof response === 'object' && 'data' in response) {
      // Response has data wrapper
      accounts = Array.isArray(response.data) ? response.data : []
    } else if (response && typeof response === 'object' && 'accounts' in response) {
      // Response has accounts field (Later API format)
      accounts = Array.isArray((response as any).accounts) ? (response as any).accounts : []
    } else {
      // Unknown format
      console.error('[Later Client] Unexpected response format:', response)
      accounts = []
    }

    // Normalize accounts: map _id to id for consistency
    accounts = accounts.map((account) => ({
      ...account,
      id: account._id || account.id, // Use _id as the primary ID
      profileId: typeof account.profileId === 'object'
        ? account.profileId._id
        : account.profileId, // Extract _id from profileId object
    }))

    console.log(`[Later Client] Found ${accounts.length} account(s)`)

    return accounts
  }

  /**
   * Get a specific account by ID
   * GET /accounts/:accountId
   */
  async getAccount(accountId: string): Promise<LaterAccount> {
    console.log(`[Later Client] Getting account: ${accountId}`)

    const account = await this.request<LaterAccount>(`/accounts/${accountId}`)

    console.log(`[Later Client] Account retrieved: ${account.username}`)

    return account
  }

  // =============================================================================
  // MEDIA UPLOAD API
  // =============================================================================

  /**
   * Upload media file from URL
   * POST /media
   */
  async uploadMediaFromUrl(
    url: string,
    options?: MediaUploadOptions
  ): Promise<LaterMediaUpload> {
    console.log(`[Later Client] 📤 Uploading media from URL: ${url}`)

    try {
      // Fetch media as buffer
      console.log(`[Later Client] ⬇️ Downloading media from URL...`)
      const buffer = await fetchMediaAsBuffer(url)
      console.log(`[Later Client] ✅ Downloaded ${buffer.length} bytes`)

      // Prepare upload options
      const uploadOptions = options || prepareUploadOptions(url)
      console.log(`[Later Client] 📋 Upload options:`, {
        filename: uploadOptions.filename,
        contentType: uploadOptions.contentType,
        bufferSize: buffer.length,
      })

      const uploadContentType = uploadOptions.contentType || 'application/octet-stream'

      console.log('[Later Client] 🔗 Requesting presigned upload URL...')
      const presign = await this.request<{
        uploadUrl: string
        publicUrl: string
        key?: string
        type?: 'image' | 'video' | 'document'
      }>('/media/presign', {
        method: 'POST',
        body: JSON.stringify({
          filename: uploadOptions.filename || 'media',
          contentType: uploadContentType,
          size: buffer.length,
        }),
      })

      console.log('[Later Client] ⬆️ Uploading media via presigned URL...')
      const uploadResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: buffer as unknown as BodyInit,
        headers: {
          'Content-Type': uploadContentType,
        },
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => '')
        throw new LaterMediaUploadError(
          `Failed to upload to presigned URL: ${uploadResponse.status} ${uploadResponse.statusText} ${errorText}`.trim(),
          url
        )
      }

      const detectedType = detectMediaType(url)
      const resolvedType =
        presign.type === 'image' || presign.type === 'video'
          ? presign.type
          : uploadContentType.startsWith('video/')
            ? 'video'
            : uploadContentType.startsWith('image/')
              ? 'image'
              : detectedType === 'video'
                ? 'video'
                : 'image'

      const response: LaterMediaUpload = {
        id: presign.key || presign.publicUrl,
        url: presign.publicUrl,
        type: resolvedType,
        filename: uploadOptions.filename,
        size: buffer.length,
      }

      console.log(
        `[Later Client] ✅ Media uploaded successfully via presign: ${response.id} (${response.type})`
      )
      console.log(`[Later Client] Later media URL: ${response.url}`)

      return response
    } catch (error) {
      console.error(`[Later Client] ❌ Upload failed for ${url}:`, error)

      if (error instanceof LaterMediaUploadError) {
        throw error
      }

      throw new LaterMediaUploadError(
        `Failed to upload media from ${url}`,
        url,
        error
      )
    }
  }

  /**
   * Upload media file from Buffer
   * POST /media
   */
  async uploadMediaFromBuffer(
    buffer: Buffer,
    options: MediaUploadOptions
  ): Promise<LaterMediaUpload> {
    console.log(`[Later Client] Uploading media from buffer (${buffer.length} bytes)`)

    try {
      const uploadContentType = options.contentType || 'application/octet-stream'

      console.log('[Later Client] 🔗 Requesting presigned upload URL...')
      const presign = await this.request<{
        uploadUrl: string
        publicUrl: string
        key?: string
        type?: 'image' | 'video' | 'document'
      }>('/media/presign', {
        method: 'POST',
        body: JSON.stringify({
          filename: options.filename || 'media',
          contentType: uploadContentType,
          size: buffer.length,
        }),
      })

      console.log('[Later Client] ⬆️ Uploading media via presigned URL...')
      const uploadResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: buffer as unknown as BodyInit,
        headers: {
          'Content-Type': uploadContentType,
        },
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => '')
        throw new LaterMediaUploadError(
          `Failed to upload to presigned URL: ${uploadResponse.status} ${uploadResponse.statusText} ${errorText}`.trim()
        )
      }

      const detectedType = detectMediaType(options.filename || '')
      const resolvedType =
        presign.type === 'image' || presign.type === 'video'
          ? presign.type
          : uploadContentType.startsWith('video/')
            ? 'video'
            : uploadContentType.startsWith('image/')
              ? 'image'
              : detectedType === 'video'
                ? 'video'
                : 'image'

      const response: LaterMediaUpload = {
        id: presign.key || presign.publicUrl,
        url: presign.publicUrl,
        type: resolvedType,
        filename: options.filename,
        size: buffer.length,
      }

      console.log(
        `[Later Client] Media uploaded successfully via presign: ${response.id} (${response.type})`
      )

      return response
    } catch (error) {
      throw new LaterMediaUploadError(
        'Failed to upload media from buffer',
        undefined,
        error
      )
    }
  }

  /**
   * Batch upload multiple media files from URLs
   * Uploads in parallel for better performance
   */
  async uploadMultipleMedia(
    urls: string[]
  ): Promise<LaterMediaUpload[]> {
    console.log(`[Later Client] Uploading ${urls.length} media files`)

    const results = await Promise.allSettled(
      urls.map((url) => this.uploadMediaFromUrl(url))
    )

    const successful: LaterMediaUpload[] = []
    const failed: Array<{ url: string; error: unknown }> = []

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value)
      } else {
        failed.push({
          url: urls[index],
          error: result.reason,
        })
      }
    })

    if (failed.length > 0) {
      console.error(
        `[Later Client] ${failed.length}/${urls.length} media uploads failed`,
        failed
      )
    }

    console.log(
      `[Later Client] Successfully uploaded ${successful.length}/${urls.length} media files`
    )

    return successful
  }

  // =============================================================================
  // POSTS API
  // =============================================================================

  /**
   * Create a new post
   * POST /posts
   */
  async createPost(payload: CreateLaterPostPayload): Promise<LaterPost> {
    console.log('[Later Client] Creating post', {
      platforms: payload.platforms,
      mediaCount: payload.mediaItems?.length || 0,
      mediaType: payload.mediaItems ? 'mediaItems' : 'none',
      hasSchedule: !!payload.scheduledFor,
    })

    // Log full payload for debugging
    console.log('[Later Client] Full payload:', JSON.stringify(payload, null, 2))

    const response = await this.request<any>('/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    console.log('[Later Client] 🔍 Response summary:', JSON.stringify(this.summarizePostResponse(response), null, 2))

    // Later API returns { post: {...}, message: "..." }
    // Extract the post object and normalize _id to id
    const postData = response.post || response
    const post: LaterPost = {
      ...postData,
      id: postData._id || postData.id, // Normalize _id to id
    }

    console.log(`[Later Client] Post created: ${post.id} (${post.status})`)

    return post
  }

  /**
   * Get a post by ID
   * GET /posts/:postId
   */
  async getPost(postId: string): Promise<LaterPost> {
    console.log(`[Later Client] Getting post: ${postId}`)

    const post = await this.request<LaterPost>(`/posts/${postId}`)

    console.log(`[Later Client] Post retrieved: ${post.id} (${post.status})`)

    return post
  }

  /**
   * Update a post
   * PUT /posts/:postId
   * Only posts with status: draft, scheduled, failed, or partial can be edited
   */
  async updatePost(
    postId: string,
    payload: UpdateLaterPostPayload
  ): Promise<LaterPost> {
    console.log(`[Later Client] Updating post: ${postId}`)
    console.log(`[Later Client] Update payload:`, JSON.stringify(payload, null, 2))

    const post = await this.request<LaterPost>(`/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })

    console.log(`[Later Client] Post updated: ${post.id} (${post.status})`)

    return post
  }

  /**
   * Delete a post
   * DELETE /posts/:postId
   */
  async deletePost(postId: string): Promise<void> {
    console.log(`[Later Client] Deleting post: ${postId}`)

    await this.request<void>(`/posts/${postId}`, {
      method: 'DELETE',
    })

    console.log(`[Later Client] Post deleted: ${postId}`)
  }

  /**
   * Schedule a post for publishing
   * POST /posts/:postId/schedule
   */
  async schedulePost(
    postId: string,
    publishAt: Date | string
  ): Promise<LaterPost> {
    console.log(`[Later Client] Scheduling post: ${postId}`, {
      publishAt,
    })

    const isoTimestamp =
      typeof publishAt === 'string' ? publishAt : publishAt.toISOString()

    const post = await this.request<LaterPost>(`/posts/${postId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ publishAt: isoTimestamp }),
    })

    console.log(`[Later Client] Post scheduled: ${post.id} (${post.status})`)

    return post
  }

  /**
   * Publish a post immediately
   * POST /posts/:postId/publish
   */
  async publishPost(postId: string): Promise<LaterPost> {
    console.log(`[Later Client] Publishing post immediately: ${postId}`)

    const post = await this.request<LaterPost>(`/posts/${postId}/publish`, {
      method: 'POST',
    })

    console.log(`[Later Client] Post published: ${post.id} (${post.status})`)

    return post
  }

  // =============================================================================
  // CONVENIENCE METHODS
  // =============================================================================

  /**
   * Create and schedule a post in one step
   * Convenience method combining createPost and schedulePost
   */
  async createScheduledPost(
    payload: CreateLaterPostPayload
  ): Promise<LaterPost> {
    const post = await this.createPost(payload)

    // If publishAt was provided, the post is already scheduled
    // Otherwise, we can schedule it separately if needed
    return post
  }

  /**
   * Create post with media upload from URLs
   * Uploads media first, then creates the post
   */
  async createPostWithMedia(
    payload: Omit<CreateLaterPostPayload, 'mediaItems'>,
    mediaUrls: string[]
  ): Promise<LaterPost> {
    console.log(
      `[Later Client] Creating post with ${mediaUrls.length} media files`
    )
    console.log(`[Later Client] Media URLs to upload:`, mediaUrls)

    // Upload all media files
    console.log(`[Later Client] 📤 Starting batch upload of ${mediaUrls.length} media files...`)
    const uploadedMedia = await this.uploadMultipleMedia(mediaUrls)

    console.log(`[Later Client] 📊 Upload results: ${uploadedMedia.length}/${mediaUrls.length} successful`)

    if (uploadedMedia.length === 0) {
      console.error('[Later Client] ❌ All media uploads failed')
      throw new LaterMediaUploadError(
        'Failed to upload any media files'
      )
    }
    if (uploadedMedia.length !== mediaUrls.length) {
      const failedCount = mediaUrls.length - uploadedMedia.length
      console.error(`[Later Client] ❌ ${failedCount} media file(s) failed to upload`)
      throw new LaterMediaUploadError(
        `Failed to upload ${failedCount} media file(s)`
      )
    }

    console.log(`[Later Client] ✅ All media uploaded successfully`)

    // Create post with uploaded media
    const postPayload: CreateLaterPostPayload = {
      ...payload,
      mediaItems: uploadedMedia.map((m) => ({ type: m.type, url: m.url })),
    }

    console.log(`[Later Client] 📝 Creating post with uploaded media...`)
    console.log(`[Later Client] Media items for payload:`, postPayload.mediaItems)

    const post = await this.createPost(postPayload)

    console.log(
      `[Later Client] ✅ Post created successfully with ${uploadedMedia.length} media files: ${post.id}`
    )

    return post
  }

  // =============================================================================
  // ANALYTICS API (requires Analytics add-on $10/month)
  // =============================================================================

  /**
   * Get analytics for posts
   * Requires Analytics add-on ($10/month)
   * Rate limit: Check docs (assuming 30 requests/hour)
   *
   * GET /api/v1/analytics
   */
  async getAnalytics(params?: AnalyticsQueryParams): Promise<LaterAnalyticsResponse> {
    const queryParams = new URLSearchParams({
      platform: params?.platform || 'instagram',
      limit: String(params?.limit || 100),
      page: String(params?.page || 1),
      sortBy: params?.sortBy || 'date',
      order: params?.order || 'desc',
    })

    // Add optional params
    if (params?.profileId) {
      queryParams.set('profileId', params.profileId)
    }
    if (params?.fromDate) {
      queryParams.set('fromDate', params.fromDate)
    }
    if (params?.toDate) {
      queryParams.set('toDate', params.toDate)
    }
    if (params?.postId) {
      queryParams.set('postId', params.postId)
    }

    console.log('[Later Analytics] Fetching analytics:', queryParams.toString())

    const response = await this.request<LaterAnalyticsResponse>(
      `/analytics?${queryParams}`
    )

    console.log(`[Later Analytics] Fetched ${response.posts?.length || 0} posts`)

    return response
  }

  /**
   * Transform raw analytics post to normalized format
   */
  private transformAnalyticsPost(rawPost: LaterRawAnalyticsPost): LaterPostAnalytics {
    const analytics = rawPost.analytics

    // Calculate engagement (likes + comments + shares)
    const engagement = (analytics.likes || 0) + (analytics.comments || 0) + (analytics.shares || 0)

    // Calculate engagement rate (engagement / reach)
    const engagementRate = analytics.reach > 0
      ? (engagement / analytics.reach) * 100
      : 0

    return {
      postId: rawPost._id,
      platform: rawPost.platform,
      publishedAt: rawPost.publishedAt,
      platformPostUrl: rawPost.platformPostUrl,
      metrics: {
        likes: analytics.likes || 0,
        comments: analytics.comments || 0,
        shares: analytics.shares || 0,
        impressions: analytics.impressions || 0,
        reach: analytics.reach || 0,
        engagement,
        engagementRate,
        views: analytics.views || 0,
        clicks: analytics.clicks || 0,
      },
    }
  }

  /**
   * Get analytics for all posts
   * Returns a map of postId -> analytics for easy lookup
   * GET /api/v1/analytics
   */
  async getAllPostAnalytics(params?: Omit<AnalyticsQueryParams, 'postId'>): Promise<Map<string, LaterPostAnalytics>> {
    console.log('[Later Analytics] Fetching all post analytics')

    const response = await this.getAnalytics(params)

    if (!response.posts || response.posts.length === 0) {
      console.log('[Later Analytics] No posts with analytics found')
      return new Map()
    }

    // Transform and create map
    const analyticsMap = new Map<string, LaterPostAnalytics>()

    response.posts.forEach((rawPost) => {
      const normalized = this.transformAnalyticsPost(rawPost)
      analyticsMap.set(normalized.postId, normalized)
    })

    console.log(`[Later Analytics] Fetched analytics for ${analyticsMap.size} posts`)

    return analyticsMap
  }

  /**
   * Get analytics for specific post
   * Since Later API doesn't support postId filter, we fetch all and find the match
   */
  async getPostAnalytics(postId: string): Promise<LaterPostAnalytics> {
    console.log('[Later Analytics] Fetching analytics for post:', postId)

    const analyticsMap = await this.getAllPostAnalytics()

    const analytics = analyticsMap.get(postId)

    if (!analytics) {
      throw new LaterNotFoundError(`Analytics not found for post: ${postId}`)
    }

    console.log('[Later Analytics] Found analytics:', {
      postId: analytics.postId,
      likes: analytics.metrics.likes,
      engagement: analytics.metrics.engagement,
      reach: analytics.metrics.reach,
    })

    return analytics
  }
}

/**
 * Singleton instance for global use
 * Use this if you don't need multiple client instances
 */
let laterClientInstance: LaterClient | null = null

export function getLaterClient(
  config?: Partial<LaterClientConfig>
): LaterClient {
  if (!laterClientInstance) {
    laterClientInstance = new LaterClient(config)
  }
  return laterClientInstance
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetLaterClient(): void {
  laterClientInstance = null
}
