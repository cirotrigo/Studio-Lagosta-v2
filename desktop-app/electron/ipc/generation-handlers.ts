import { ipcMain } from 'electron'

type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

interface ExecuteRequestResult {
  isHtml: boolean
  text: string
  status: number
  statusText: string
  ok: boolean
  responseUrl?: string
}

interface AuthHtmlResult {
  isHtml: boolean
  text: string
  status: number
  responseUrl?: string
}

interface BackgroundGenerationPayload {
  projectId: number
  prompt: string
  format: ArtFormat
  referenceUrls?: string[]
}

interface BackgroundGenerationResponse {
  imageUrl: string
  prompt: string
  provider: string
  modelUsed: string
  fallbackModel: string
  fallbackUsed: boolean
  referenceCount: number
  persisted: boolean
  persistedImageUrl?: string
  warnings: string[]
}

interface BackgroundGenerationMeta {
  modelUsed?: string
  fallbackModel?: string
  fallbackUsed?: boolean
  provider?: string
  referenceCount?: number
  persisted?: boolean
  persistedImageUrl?: string
  warnings?: string[]
}

interface RegisterGenerationHandlersDeps {
  webAppBaseUrl: string
  getFreshCookies: () => Promise<string | null>
  refreshClerkSession: () => Promise<boolean>
  executeRequest: (
    url: string,
    options: RequestInit,
    cookies: string | null,
  ) => Promise<ExecuteRequestResult>
  isAuthHtmlResponse: (result: AuthHtmlResult) => boolean
  extractErrorMessage: (payload: unknown, fallback: string) => string
}

const MAX_REFERENCE_IMAGES = 5
const GENERATE_AI_BACKGROUND_CHANNEL = 'generate-ai-background'

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeArtFormat(value: unknown): ArtFormat {
  if (value === 'FEED_PORTRAIT' || value === 'SQUARE') return value
  return 'STORY'
}

function normalizeReferenceUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const refs = value
    .filter((entry): entry is string => typeof entry === 'string' && isHttpUrl(entry))
    .slice(0, MAX_REFERENCE_IMAGES)

  return refs.length > 0 ? refs : undefined
}

function normalizeBackgroundGenerationPayload(input: unknown): BackgroundGenerationPayload {
  const raw = asObject(input)
  const projectId = Number(raw.projectId)

  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error('projectId invalido para fundo IA')
  }

  const prompt = normalizeText(raw.prompt, 500)
  if (!prompt) {
    throw new Error('prompt obrigatorio para gerar fundo IA')
  }

  return {
    projectId,
    prompt,
    format: normalizeArtFormat(raw.format),
    referenceUrls: normalizeReferenceUrls(raw.referenceUrls),
  }
}

function normalizeBackgroundGenerationResponse(rawData: unknown): BackgroundGenerationResponse {
  const raw = asObject(rawData)
  const images = Array.isArray(raw.images) ? raw.images : []
  const firstImage = asObject(images[0])
  const backgroundMetas = Array.isArray(raw.backgroundGenerations) ? raw.backgroundGenerations : []
  const firstMeta = asObject(backgroundMetas[0]) as BackgroundGenerationMeta

  const imageUrlCandidate = normalizeText(firstImage.imageUrl, 4_000)
  const persistedImageUrlCandidate = normalizeText(firstMeta.persistedImageUrl, 4_000)
  const imageUrl = imageUrlCandidate || persistedImageUrlCandidate

  if (!imageUrl) {
    throw new Error('Resposta invalida ao gerar fundo IA: imagem ausente')
  }

  return {
    imageUrl,
    prompt: normalizeText(firstImage.prompt || raw.prompt, 4_000),
    provider: normalizeText(firstMeta.provider || raw.provider, 80) || 'nano-banana-2',
    modelUsed: normalizeText(firstMeta.modelUsed, 160),
    fallbackModel: normalizeText(firstMeta.fallbackModel, 160),
    fallbackUsed: normalizeBoolean(firstMeta.fallbackUsed),
    referenceCount:
      typeof firstMeta.referenceCount === 'number' && Number.isFinite(firstMeta.referenceCount)
        ? firstMeta.referenceCount
        : 0,
    persisted: normalizeBoolean(firstMeta.persisted) || isHttpUrl(imageUrl),
    persistedImageUrl: persistedImageUrlCandidate || (isHttpUrl(imageUrl) ? imageUrl : undefined),
    warnings: Array.isArray(firstMeta.warnings)
      ? firstMeta.warnings
          .filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
          .slice(0, 6)
      : [],
  }
}

function handleGenerationError(action: string, error: unknown): never {
  console.error(`[Konva Generation IPC] ${action} falhou:`, error)
  throw error instanceof Error ? error : new Error(`${action} falhou`)
}

export function registerGenerationHandlers(deps: RegisterGenerationHandlersDeps): void {
  ipcMain.removeHandler(GENERATE_AI_BACKGROUND_CHANNEL)

  ipcMain.handle(GENERATE_AI_BACKGROUND_CHANNEL, async (_event, rawPayload: unknown) => {
    try {
      const payload = normalizeBackgroundGenerationPayload(rawPayload)
      const endpoint = `${deps.webAppBaseUrl}/api/tools/generate-art`
      const requestBody = {
        projectId: payload.projectId,
        text: payload.prompt,
        format: payload.format,
        variations: 1,
        includeLogo: false,
        usePhoto: false,
        backgroundOnly: true,
        compositionEnabled: false,
        compositionReferenceUrls: payload.referenceUrls,
      }

      let cookies = await deps.getFreshCookies()
      let result = await deps.executeRequest(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        },
        cookies,
      )

      if (result.isHtml && deps.isAuthHtmlResponse(result)) {
        console.log('[generate-ai-background] Got HTML - attempting session refresh then retry...')
        const refreshed = await deps.refreshClerkSession()
        if (refreshed) {
          cookies = await deps.getFreshCookies()
          result = await deps.executeRequest(
            endpoint,
            {
              method: 'POST',
              body: JSON.stringify(requestBody),
            },
            cookies,
          )
        }
      }

      if (result.isHtml && deps.isAuthHtmlResponse(result)) {
        throw new Error('Sessao expirada. Faca login novamente.')
      }

      if (result.isHtml) {
        throw new Error(`Servico de fundo IA indisponivel no momento (HTTP ${result.status})`)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(result.text)
      } catch {
        throw new Error('Resposta invalida ao gerar fundo IA')
      }

      if (!result.ok) {
        throw new Error(
          deps.extractErrorMessage(
            parsed,
            `Falha ao gerar fundo IA (${result.status} ${result.statusText})`,
          ),
        )
      }

      return normalizeBackgroundGenerationResponse(parsed)
    } catch (error) {
      return handleGenerationError('background.generate', error)
    }
  })

  console.info('[Konva Generation IPC] Handlers registrados')
}
