/**
 * Client para geração de imagens via API do Google Gemini.
 *
 * Usa o SDK oficial @google/genai com os modelos atuais da família
 * Nano Banana para geração e edição de imagens com referências visuais.
 */

import { GoogleGenAI } from '@google/genai'
import { AI_IMAGE_MODELS } from '@/lib/ai/image-models-config'

// Singleton do client Gemini
let _geminiClient: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI {
  if (!_geminiClient) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY não está configurada')
    }
    _geminiClient = new GoogleGenAI({ apiKey })
  }
  return _geminiClient
}

export type GeminiImageModel = 'nano-banana-2' | 'nano-banana-pro'

/**
 * Override por env do ID do Google, para o dia em que o modelo de hoje também
 * se aposentar — trocar a variável na Vercel e redeployar, sem mexer em código.
 * Mesmo padrão do `GEMINI_VISION_MODEL` (`reconciliar-catalogo.ts`).
 */
const ENV_DO_MODELO: Record<GeminiImageModel, string> = {
  'nano-banana-2': 'GEMINI_IMAGE_MODEL_NANO_BANANA_2',
  'nano-banana-pro': 'GEMINI_IMAGE_MODEL_NANO_BANANA_PRO',
}

/**
 * ID do Google que vai no `generateContent` para cada apelido interno.
 *
 * 🔴 Até 21/11/2026 isto apontava para `gemini-3.1-flash-image-preview` e
 * `gemini-3-pro-image-preview`, previews que o Google desligou em 25/06/2026.
 * A fonte única é `AI_IMAGE_MODELS[model].version`; não repita o ID aqui.
 */
export function resolverIdDoModeloGemini(
  model: GeminiImageModel,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env[ENV_DO_MODELO[model]]?.trim()
  return override || AI_IMAGE_MODELS[model]?.version
}

/**
 * Por que a geração falhou, decidido pelo STATUS HTTP quando ele existe.
 *
 * 🔴 Não classifique pela mensagem primeiro: o 404 padrão do Google é
 * "models/X is not found for API version v1beta, or is not supported for
 * generateContent", e "generateContent" contém "rate". O código antigo
 * procurava "rate" antes de "not found", e um modelo DESLIGADO era reportado
 * como "Limite de uso da API atingido" (e tratado como passageiro).
 */
export type GeminiImageErrorKind =
  | 'modelo-indisponivel'
  | 'limite-de-uso'
  | 'seguranca'
  | 'autenticacao'
  | 'parametros-invalidos'
  | 'instabilidade'
  | 'desconhecido'

export class GeminiImageError extends Error {
  readonly kind: GeminiImageErrorKind
  readonly httpStatus?: number
  readonly modelId?: string

  constructor(
    message: string,
    opts: { kind: GeminiImageErrorKind; httpStatus?: number; modelId?: string; cause?: unknown },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'GeminiImageError'
    this.kind = opts.kind
    this.httpStatus = opts.httpStatus
    this.modelId = opts.modelId
  }
}

const MENSAGEM_DO_TIPO: Partial<Record<GeminiImageErrorKind, string>> = {
  seguranca:
    '🚫 Conteúdo bloqueado pelo filtro de segurança do Google.\n\n' +
    'Por favor, ajuste o prompt e tente novamente com conteúdo apropriado.',
  'limite-de-uso':
    '⚠️ Limite de uso da API atingido.\n\n' +
    'Aguarde alguns minutos e tente novamente.',
  autenticacao:
    '🔑 Erro de autenticação com a API Google.\n\n' +
    'Contate o suporte técnico.',
  'modelo-indisponivel':
    '❌ Modelo de IA não disponível.\n\n' +
    'O modelo solicitado pode não estar disponível na sua região ou conta.',
  'parametros-invalidos':
    '❌ Parâmetros inválidos.\n\n' +
    'Verifique o prompt e as configurações e tente novamente.',
}

function statusHttpDe(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 100 && status <= 599 ? status : undefined
}

const PADROES_DE_LIMITE = ['rate limit', 'rate_limit', 'ratelimit', 'too many requests', 'quota', 'resource_exhausted']
const PADROES_DE_MODELO_AUSENTE = [
  'not found',
  'not_found',
  'does not exist',
  'no longer available',
  'has been deprecated',
  'has been shut down',
  'has been discontinued',
]
const PADROES_DE_INSTABILIDADE = ['unavailable', 'overloaded', 'deadline', 'timeout', 'internal error', 'temporarily']

/**
 * Classifica um erro da geração. Ordem: status HTTP (404, 429, 401/403, 5xx),
 * depois o texto só para o que veio sem status (erro do próprio client ou de
 * rede). Puro: não toca rede nem env.
 */
export function classificarErroGemini(error: unknown): {
  kind: GeminiImageErrorKind
  httpStatus?: number
} {
  if (error instanceof GeminiImageError) {
    return { kind: error.kind, httpStatus: error.httpStatus }
  }

  const httpStatus = statusHttpDe(error)
  const texto = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()

  if (httpStatus === 404) return { kind: 'modelo-indisponivel', httpStatus }
  if (httpStatus === 429) return { kind: 'limite-de-uso', httpStatus }
  if (httpStatus === 401 || httpStatus === 403) return { kind: 'autenticacao', httpStatus }
  if (httpStatus !== undefined && httpStatus >= 500) return { kind: 'instabilidade', httpStatus }

  // Sem status, ou 400: o texto decide.
  if (['safety', 'blocked', 'harm', 'responsible'].some((p) => texto.includes(p))) {
    return { kind: 'seguranca', httpStatus }
  }
  // O Google devolve 400 INVALID_ARGUMENT para chave inválida ("API key not
  // valid"), por isso autenticação vem antes de "invalid".
  if (['api key', 'api_key', 'unauthorized', 'authentication', 'permission'].some((p) => texto.includes(p))) {
    return { kind: 'autenticacao', httpStatus }
  }
  if (PADROES_DE_LIMITE.some((p) => texto.includes(p))) return { kind: 'limite-de-uso', httpStatus }
  if (PADROES_DE_MODELO_AUSENTE.some((p) => texto.includes(p))) {
    return { kind: 'modelo-indisponivel', httpStatus }
  }
  if (texto.includes('invalid') && !texto.includes('image')) {
    return { kind: 'parametros-invalidos', httpStatus }
  }
  if (httpStatus === undefined && PADROES_DE_INSTABILIDADE.some((p) => texto.includes(p))) {
    return { kind: 'instabilidade', httpStatus }
  }
  return { kind: 'desconhecido', httpStatus }
}

export interface GeminiImageParams {
  model: GeminiImageModel
  prompt: string
  aspectRatio?: string
  resolution?: '1K' | '2K' | '4K'
  referenceImages?: Buffer[]
  referenceImageTypes?: string[]
  mode?: 'generate' | 'edit'
  baseImage?: Buffer
  baseImageType?: string
}

export interface GeminiImageResult {
  imageBuffer: Buffer
  mimeType: string
}

/**
 * Monta a configuração nativa de imagem da Gemini API.
 */
function buildImageConfig(
  params: GeminiImageParams,
): { aspectRatio?: string; imageSize?: '1K' | '2K' | '4K' } | undefined {
  const imageConfig: { aspectRatio?: string; imageSize?: '1K' | '2K' | '4K' } = {}

  if (params.aspectRatio) {
    imageConfig.aspectRatio = params.aspectRatio
  }

  if (params.resolution) {
    imageConfig.imageSize = params.resolution
  }

  return Object.keys(imageConfig).length > 0 ? imageConfig : undefined
}

/**
 * Gera uma imagem usando Gemini Image Generation.
 */
export async function generateImageWithGemini(
  params: GeminiImageParams
): Promise<GeminiImageResult> {
  const client = getGeminiClient()
  const modelId = resolverIdDoModeloGemini(params.model)

  if (!modelId) {
    throw new Error(`Modelo não suportado: ${params.model}`)
  }

  console.log('[Gemini Image] Generating image:', {
    model: modelId,
    internalModel: params.model,
    promptLength: params.prompt.length,
    hasBaseImage: !!params.baseImage,
    referenceCount: params.referenceImages?.length || 0,
    aspectRatio: params.aspectRatio,
    mode: params.mode,
  })

  // Montar o contents array
  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  // Adicionar imagem base para edição
  if (params.mode === 'edit' && params.baseImage) {
    contents.push({
      inlineData: {
        mimeType: params.baseImageType || 'image/jpeg',
        data: params.baseImage.toString('base64'),
      },
    })
  }

  // Adicionar imagens de referência (até 14 para ambos os modelos)
  if (params.referenceImages && params.referenceImages.length > 0) {
    const maxRefs = Math.min(params.referenceImages.length, 14)
    for (let i = 0; i < maxRefs; i++) {
      contents.push({
        inlineData: {
          mimeType: params.referenceImageTypes?.[i] || 'image/jpeg',
          data: params.referenceImages[i].toString('base64'),
        },
      })
    }
  }

  // Adicionar o prompt de texto
  contents.push({ text: params.prompt })

  try {
    const imageConfig = buildImageConfig(params)

    const response = await client.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(imageConfig ? { imageConfig } : {}),
      },
    })

    // Extrair imagem da resposta
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error('Nenhum candidato retornado pela API Gemini')
    }

    const parts = response.candidates[0].content?.parts
    if (!parts || parts.length === 0) {
      throw new Error('Resposta vazia da API Gemini')
    }

    // Procurar a parte com imagem
    for (const part of parts) {
      if (part.inlineData?.data) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64')

        console.log('[Gemini Image] Success:', {
          model: modelId,
          mimeType: part.inlineData.mimeType || 'image/png',
          sizeBytes: imageBuffer.length,
          sizeMB: (imageBuffer.length / (1024 * 1024)).toFixed(2),
        })

        return {
          imageBuffer,
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      }
    }

    // Se chegou aqui, não encontrou imagem - pode ter texto de erro
    const textParts = parts.filter(p => p.text).map(p => p.text).join(' ')
    throw new Error(
      textParts
        ? `API Gemini retornou texto ao invés de imagem: ${textParts.substring(0, 200)}`
        : 'API Gemini não retornou nenhuma imagem'
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const { kind, httpStatus } = classificarErroGemini(error)

    // console.error sobrevive ao `removeConsole` do build de produção
    // (next.config.ts): é a única linha que mostra o texto CRU do Google.
    console.error('[Gemini Image] Error:', {
      model: modelId,
      kind,
      httpStatus,
      error: errorMessage,
    })

    // Instabilidade e erro desconhecido mantêm o texto original, como antes;
    // o `kind` é o que decide retry e alternativa, não o texto.
    const mensagem = MENSAGEM_DO_TIPO[kind] ?? errorMessage
    throw new GeminiImageError(mensagem, { kind, httpStatus, modelId, cause: error })
  }
}

/**
 * Verifica se o erro é passageiro (vale tentar de novo / outro provider).
 *
 * Aceita o erro (preferível: usa o `kind`) ou só a mensagem, para quem ainda
 * passa string. 🔴 "rate" solto não entra nos padrões: casa "generateContent",
 * "migrate", "generate"...
 */
export function isGeminiRetryableError(errorOrMessage: unknown): boolean {
  if (errorOrMessage instanceof GeminiImageError) {
    return errorOrMessage.kind === 'limite-de-uso' || errorOrMessage.kind === 'instabilidade'
  }

  const lowerError = (
    errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage ?? '')
  ).toLowerCase()

  const retryablePatterns = [
    'rate limit',
    'rate_limit',
    'too many requests',
    '429',
    '503',
    '500',
    'resource_exhausted',
    'quota',
    'unavailable',
    'deadline',
    'timeout',
    'internal',
    'temporarily',
    'overloaded',
    'limite de uso',
    'temporariamente indisponível',
  ]

  const nonRetryablePatterns = [
    'safety',
    'blocked',
    'harm',
    'api key',
    'unauthorized',
    'authentication',
    'permission',
    'invalid',
    'billing',
    'not found',
    'not_found',
    'does not exist',
    'responsible',
    'modelo de ia não disponível',
  ]

  if (nonRetryablePatterns.some(p => lowerError.includes(p))) {
    return false
  }

  return retryablePatterns.some(p => lowerError.includes(p))
}

/**
 * Vale acionar a ALTERNATIVA (outro modelo ou outro provider)? Sim quando o
 * erro é passageiro E quando o modelo não existe mais: modelo desligado é
 * justamente o caso em que tentar de novo o MESMO não adianta e outro adianta.
 * Não para segurança, autenticação ou parâmetros: a alternativa erraria igual.
 */
export function deveTentarAlternativaGemini(error: unknown): boolean {
  const { kind } = classificarErroGemini(error)
  return kind === 'modelo-indisponivel' || kind === 'limite-de-uso' || kind === 'instabilidade'
}
