export interface InstagramStory {
  id: string
  caption?: string
  permalink?: string
  timestamp: string
  media_type?: string
  media_url?: string
}

export interface InstagramStoryInsights {
  /**
   * Métrica atual de exibições. Substituiu `impressions`, descontinuada pelo
   * Instagram em março/2025 para mídia e stories.
   */
  views: number
  reach: number
  replies?: number
  exits?: number
  taps_forward?: number
  taps_back?: number
  /** @deprecated mantido só para leitura de dados antigos; a API não retorna mais */
  impressions?: number
}

/** Métricas de post de feed (carrossel, imagem, reel) — não expiram como stories */
export interface InstagramMediaInsights {
  likes: number
  comments: number
  reach: number
  saved?: number
  shares?: number
  views?: number
  /** likes + comentários + compartilhamentos */
  engagement: number
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
  /**
   * O host depende do tipo do token:
   * - `IGAA...` → Instagram API with Instagram Login, responde em graph.instagram.com
   * - demais (Page/User token do Facebook) → graph.facebook.com
   *
   * Usar o host errado devolve "Cannot parse access token", que é fácil de
   * confundir com token inválido. Override manual: INSTAGRAM_GRAPH_API_BASE_URL.
   */
  private get baseUrl(): string {
    const override = process.env.INSTAGRAM_GRAPH_API_BASE_URL
    if (override) return override.replace(/\/+$/, '')
    return this.accessToken.startsWith('IGAA')
      ? 'https://graph.instagram.com'
      : 'https://graph.facebook.com'
  }

  private readonly version = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v25.0'

  private get accessToken(): string {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    if (!token) {
      throw new InstagramApiException('INSTAGRAM_ACCESS_TOKEN is not configured', 500)
    }
    return token
  }

  /** GET no endpoint, com parse, sanitização de erro e log de rate limit */
  private async get(path: string, params: Record<string, string>): Promise<any> {
    const url = new URL(`${this.baseUrl}/${this.version}/${path}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    url.searchParams.set('access_token', this.accessToken)

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Next.js fetch caches GET requests; disable to always fetch latest data
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

    const rateLimitHeader = response.headers.get('x-app-usage')
    if (rateLimitHeader) {
      console.log('[Instagram API] x-app-usage:', sanitizeErrorMessage(rateLimitHeader))
    }

    return body
  }

  async getStories(igUserId: string): Promise<InstagramStory[]> {
    const body = await this.get(`${igUserId}/stories`, {
      fields: 'id,caption,permalink,timestamp,media_type,media_url',
    })

    console.log('[Instagram API] Stories fetched for account', igUserId)

    return (body?.data ?? []) as InstagramStory[]
  }

  /**
   * Busca insights tolerando métricas recusadas.
   *
   * O Instagram rejeita a requisição inteira (400) se UMA métrica da lista não
   * for suportada, e o conjunto muda entre versões da API. Em vez de quebrar
   * tudo, remove a métrica citada no erro e tenta de novo.
   */
  private async getInsights(
    mediaId: string,
    metrics: string[],
  ): Promise<Record<string, number>> {
    let candidates = [...metrics]

    for (let attempt = 0; attempt < metrics.length; attempt++) {
      if (candidates.length === 0) return {}
      try {
        const body = await this.get(`${mediaId}/insights`, { metric: candidates.join(',') })
        const data = (body?.data ?? []) as InstagramInsightData[]
        const result: Record<string, number> = {}
        for (const insight of data) {
          result[insight.name] = insight.values?.[0]?.value ?? 0
        }
        return result
      } catch (error) {
        if (!(error instanceof InstagramApiException)) throw error
        // Erro de métrica inválida cita o nome dela na mensagem
        const rejected = candidates.find((m) => error.message.includes(m))
        if (!rejected) throw error
        console.warn(`[Instagram API] métrica "${rejected}" não suportada nesta versão — ignorando`)
        candidates = candidates.filter((m) => m !== rejected)
      }
    }

    return {}
  }

  /**
   * Insights de um Story. Só existem enquanto o story está no ar (24h) —
   * depois disso o dado é irrecuperável.
   *
   * Métricas: views (substituiu impressions, descontinuada em março/2025),
   * reach, replies, exits, taps_forward, taps_back.
   */
  async getStoryInsights(storyId: string): Promise<InstagramStoryInsights> {
    const values = await this.getInsights(storyId, [
      'views',
      'reach',
      'replies',
      'exits',
      'taps_forward',
      'taps_back',
    ])

    const result: InstagramStoryInsights = {
      views: values.views ?? 0,
      reach: values.reach ?? 0,
      replies: values.replies,
      exits: values.exits,
      taps_forward: values.taps_forward,
      taps_back: values.taps_back,
    }

    console.log('[Instagram API] Story insights fetched:', storyId, result)

    return result
  }

  /**
   * Métricas de um post de feed (carrossel, imagem, reel).
   *
   * Diferente de stories, não expiram — dá para buscar a qualquer momento.
   * Curtidas e comentários vêm como campos da mídia; o resto, de /insights.
   */
  async getMediaInsights(mediaId: string): Promise<InstagramMediaInsights> {
    const media = await this.get(mediaId, { fields: 'id,media_type,like_count,comments_count' })

    const likes = Number(media?.like_count ?? 0)
    const comments = Number(media?.comments_count ?? 0)

    // Insights podem falhar por permissão sem invalidar curtidas/comentários
    let values: Record<string, number> = {}
    try {
      values = await this.getInsights(mediaId, ['reach', 'saved', 'shares', 'views'])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[Instagram API] insights indisponíveis para ${mediaId}: ${message}`)
    }

    const shares = values.shares
    const result: InstagramMediaInsights = {
      likes,
      comments,
      reach: values.reach ?? 0,
      saved: values.saved,
      shares,
      views: values.views,
      engagement: likes + comments + (shares ?? 0),
    }

    console.log('[Instagram API] Media insights fetched:', mediaId, result)

    return result
  }
}
