export interface InstagramStory {
  id: string
  caption?: string
  permalink?: string
  timestamp: string
  media_type?: string
  media_url?: string
}

export interface InstagramStoryInsights {
  impressions: number
  reach: number
  replies?: number
  exits?: number
  taps_forward?: number
  taps_back?: number
}

interface InstagramInsightValue {
  value: number
}

interface InstagramInsightData {
  name: string
  period: string
  values: InstagramInsightValue[]
  title: string
  description: string
  id: string
}

interface InstagramApiError {
  message: string
  type: string
  code: number
  error_subcode?: number
  fbtrace_id?: string
}

export class InstagramApiException extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public apiError?: InstagramApiError
  ) {
    super(message)
    this.name = 'InstagramApiException'
  }

  get code(): number | undefined {
    return this.apiError?.code
  }

  get type(): string | undefined {
    return this.apiError?.type
  }

  get isTokenError(): boolean {
    return this.apiError?.code === 190 || this.message.includes('INSTAGRAM_ACCESS_TOKEN')
  }

  get isRateLimited(): boolean {
    return this.apiError?.code === 4 || this.statusCode === 429
  }

  get isPermissionError(): boolean {
    return this.apiError?.code === 10 || this.apiError?.code === 200 || this.apiError?.code === 803
  }
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]')
}

export class InstagramGraphApiClient {
  private readonly baseUrl = 'https://graph.facebook.com'
  private readonly version = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v18.0'

  private get accessToken(): string {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    if (!token) {
      throw new InstagramApiException('INSTAGRAM_ACCESS_TOKEN is not configured', 500)
    }
    return token
  }

  async getStories(igUserId: string): Promise<InstagramStory[]> {
    const url = new URL(`${this.baseUrl}/${this.version}/${igUserId}/stories`)
    url.searchParams.set('fields', 'id,caption,permalink,timestamp,media_type,media_url')
    url.searchParams.set('access_token', this.accessToken)

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      // Next.js fetch caches GET requests; disable to always fetch latest stories
      cache: 'no-store',
    })

    const rawBody = await response.text()
    let body: any

    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch (_error) {
      throw new InstagramApiException('Invalid JSON response from Instagram API', response.status)
    }

    if (!response.ok) {
      const apiError = body?.error as InstagramApiError | undefined
      const message = sanitizeErrorMessage(apiError?.message || 'Instagram API error')
      throw new InstagramApiException(message, response.status, apiError)
    }

    const stories = (body?.data ?? []) as InstagramStory[]

    const rateLimitHeader = response.headers.get('x-app-usage')
    if (rateLimitHeader) {
      console.log('[Instagram API] x-app-usage:', sanitizeErrorMessage(rateLimitHeader))
    }

    console.log('[Instagram API] Stories fetched for account', igUserId)

    return stories
  }

  /**
   * Get insights (analytics) for a specific Story
   * Must be called within 24 hours of story publication
   *
   * Available metrics for Stories:
   * - impressions: Total number of times the story was seen
   * - reach: Total number of unique accounts that saw the story
   * - replies: Number of replies to the story
   * - exits: Number of times someone exited the story
   * - taps_forward: Number of taps to see next story
   * - taps_back: Number of taps to see previous story
   */
  async getStoryInsights(storyId: string): Promise<InstagramStoryInsights> {
    const metrics = [
      'impressions',
      'reach',
      'replies',
      'exits',
      'taps_forward',
      'taps_back',
    ]

    const url = new URL(`${this.baseUrl}/${this.version}/${storyId}/insights`)
    url.searchParams.set('metric', metrics.join(','))
    url.searchParams.set('access_token', this.accessToken)

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const rawBody = await response.text()
    let body: any

    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch (_error) {
      throw new InstagramApiException('Invalid JSON response from Instagram API', response.status)
    }

    if (!response.ok) {
      const apiError = body?.error as InstagramApiError | undefined
      const message = sanitizeErrorMessage(apiError?.message || 'Instagram API error')
      throw new InstagramApiException(message, response.status, apiError)
    }

    const insights = (body?.data ?? []) as InstagramInsightData[]

    // Transform insights array to object
    const result: InstagramStoryInsights = {
      impressions: 0,
      reach: 0,
    }

    insights.forEach((insight) => {
      const value = insight.values?.[0]?.value ?? 0
      switch (insight.name) {
        case 'impressions':
          result.impressions = value
          break
        case 'reach':
          result.reach = value
          break
        case 'replies':
          result.replies = value
          break
        case 'exits':
          result.exits = value
          break
        case 'taps_forward':
          result.taps_forward = value
          break
        case 'taps_back':
          result.taps_back = value
          break
      }
    })

    console.log('[Instagram API] Story insights fetched:', storyId, result)

    return result
  }
}
