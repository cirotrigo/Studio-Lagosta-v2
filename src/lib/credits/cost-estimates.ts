/**
 * Estimativa de custo USD para chamadas de APIs externas.
 *
 * Os preços abaixo são oficiais quando conhecidos. Atualizar quando o provider
 * muda (ex: OpenAI ajustou tabela de gpt-image em maio/2026).
 *
 * Estratégia:
 * 1. A função estimateUsdCost() lê operationType + details/metadata e tenta
 *    casar com PROVIDER_PRICING.
 * 2. Quando consegue, retorna { usd, basis: 'precise' }.
 * 3. Quando não consegue (model desconhecido, metadata vazio), cai pro
 *    FALLBACK_USD_PER_CREDIT (1 crédito ≈ $0.012) e marca como 'fallback'.
 *
 * Revisar trimestralmente: as APIs ajustam preços com frequência.
 */

import type { OperationType } from '../../../prisma/generated/client'

// USD por unidade. Para image: $/imagem. Para text: $/token.
const PROVIDER_PRICING = {
  // OpenAI gpt-image-2 (verificada com a doc oficial em 2026-05)
  // Quality high
  'gpt-image-2.high.1024x1024': 0.211,
  'gpt-image-2.high.1024x1536': 0.165,
  'gpt-image-2.high.1024x1792': 0.165,
  'gpt-image-2.high.1024x1280': 0.165,
  'gpt-image-2.high.1536x1024': 0.165,
  // Quality medium
  'gpt-image-2.medium.1024x1024': 0.063,
  'gpt-image-2.medium.1024x1536': 0.045,
  'gpt-image-2.medium.1024x1792': 0.045,
  'gpt-image-2.medium.1024x1280': 0.045,
  // Quality low
  'gpt-image-2.low.1024x1024': 0.011,
  'gpt-image-2.low.1024x1536': 0.008,
  'gpt-image-2.low.1024x1792': 0.008,

  // OpenAI gpt-image-1 (preços de 2025-04, similares ao 2)
  'gpt-image-1.high.1024x1024': 0.167,
  'gpt-image-1.high.1024x1536': 0.13,
  'gpt-image-1.high.1024x1792': 0.13,
  'gpt-image-1.medium.1024x1024': 0.063,
  'gpt-image-1.medium.1024x1536': 0.042,

  // OpenAI text — por token
  'gpt-4o-mini.input': 0.00000015,
  'gpt-4o-mini.output': 0.00000060,
  'gpt-4o.input': 0.0000025,
  'gpt-4o.output': 0.000010,

  // Anthropic Claude — por token
  'claude-3-5-sonnet.input': 0.000003,
  'claude-3-5-sonnet.output': 0.000015,
  'claude-3-5-haiku.input': 0.0000008,
  'claude-3-5-haiku.output': 0.000004,

  // Google Gemini — por token (estimativa baseada em pricing público)
  'gemini-2.5-flash.input': 0.0000003,
  'gemini-2.5-flash.output': 0.0000025,
  'gemini-2.5-pro.input': 0.00000125,
  'gemini-2.5-pro.output': 0.0000050,

  // Replicate (nano-banana-pro / Gemini 3.1 Flash Image)
  'nano-banana-pro.1K': 0.06,
  'nano-banana-pro.2K': 0.10,
  'nano-banana-pro.4K': 0.20,
  'nano-banana-2.default': 0.04,
} as const

// 1 crédito ≈ $0.012 (usado quando não conseguimos derivar pelo model).
const FALLBACK_USD_PER_CREDIT = 0.012

// Mapping: format do criativo → input size enviado pro gpt-image
// (replica o mesmo mapping que está em creative-improvement-format.ts).
const FORMAT_TO_INPUT_SIZE: Record<string, string> = {
  STORY: '1024x1792',
  SQUARE: '1024x1024',
  FEED_PORTRAIT: '1024x1280',
}

interface UsageRow {
  operationType: OperationType | string
  creditsUsed: number
  details: Record<string, unknown> | null | undefined
}

export interface CostEstimate {
  usd: number
  basis: 'precise' | 'fallback'
}

export function estimateUsdCost(row: UsageRow): CostEstimate {
  const credits = row.creditsUsed || 0
  const fallback = (): CostEstimate => ({ usd: credits * FALLBACK_USD_PER_CREDIT, basis: 'fallback' })

  const details = row.details ?? {}

  switch (row.operationType) {
    case 'AI_CREATIVE_IMPROVEMENT': {
      const model = pickString(details, 'model')
      const format = pickString(details, 'format')
      const inputSize =
        pickString(details, 'inputSize') ??
        (format ? FORMAT_TO_INPUT_SIZE[format] : undefined)
      const quality = pickString(details, 'quality') ?? 'high'

      if (model && inputSize) {
        const key = `${model}.${quality}.${inputSize}`
        const price = (PROVIDER_PRICING as Record<string, number>)[key]
        if (typeof price === 'number') {
          return { usd: price, basis: 'precise' }
        }
      }
      return fallback()
    }

    case 'AI_IMAGE_GENERATION': {
      const model = pickString(details, 'model')
      const resolution = pickString(details, 'resolution')
      if (model && resolution) {
        const key = `${model}.${resolution}`
        const price = (PROVIDER_PRICING as Record<string, number>)[key]
        if (typeof price === 'number') return { usd: price, basis: 'precise' }
        const dflt = (PROVIDER_PRICING as Record<string, number>)[`${model}.default`]
        if (typeof dflt === 'number') return { usd: dflt, basis: 'precise' }
      }
      return fallback()
    }

    case 'AI_TEXT_CHAT': {
      const model = pickString(details, 'model')
      const inputTokens = pickNumber(details, 'inputTokens')
      const outputTokens = pickNumber(details, 'outputTokens')

      if (model && inputTokens != null && outputTokens != null) {
        const inPrice = (PROVIDER_PRICING as Record<string, number>)[`${model}.input`]
        const outPrice = (PROVIDER_PRICING as Record<string, number>)[`${model}.output`]
        if (typeof inPrice === 'number' && typeof outPrice === 'number') {
          return {
            usd: inputTokens * inPrice + outputTokens * outPrice,
            basis: 'precise',
          }
        }
      }
      return fallback()
    }

    // Operações onde o custo USD é majoritariamente infra (Vercel Blob, Drive)
    // — usar fallback baseado em créditos é honesto.
    case 'BACKGROUND_REMOVAL':
    case 'CREATIVE_DOWNLOAD':
    case 'VIDEO_EXPORT':
    case 'SOCIAL_MEDIA_POST':
    default:
      return fallback()
  }
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
