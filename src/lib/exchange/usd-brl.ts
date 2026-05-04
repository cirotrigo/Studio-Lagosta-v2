/**
 * Cotação USD → BRL com cache em memória.
 *
 * Fonte: AwesomeAPI (https://economia.awesomeapi.com.br) — gratuita, pública,
 * sem auth. Resposta: `{ USDBRL: { bid: '5.12', create_date: '2026-05-04 01:16:05', ... } }`.
 *
 * Estratégia:
 * - Cache em memória de 1h por lambda (em prod cada lambda tem o seu — aceitável,
 *   o desvio é mínimo).
 * - Fallback chain: API → cache expirado → constante FALLBACK_RATE.
 * - Timeout de 5s pra não atrasar requests do dashboard.
 */

const ENDPOINT = 'https://economia.awesomeapi.com.br/json/last/USD-BRL'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora
const FETCH_TIMEOUT_MS = 5_000
const FALLBACK_RATE = 5.0 // usado se API e cache falharem

export interface ExchangeRate {
  brl: number
  fetchedAt: string // ISO timestamp
  source: 'awesomeapi' | 'cache' | 'fallback'
}

let cached: { rate: ExchangeRate; expiresAt: number } | null = null

interface AwesomeApiResponse {
  USDBRL?: {
    bid?: string
    create_date?: string
  }
}

export async function getUsdBrlRate(): Promise<ExchangeRate> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.rate
  }

  try {
    const response = await fetch(ENDPOINT, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as AwesomeApiResponse
    const bid = data.USDBRL?.bid
    if (!bid) throw new Error('Resposta sem bid')
    const brl = Number.parseFloat(bid)
    if (!Number.isFinite(brl) || brl <= 0) throw new Error(`bid inválido: ${bid}`)

    const rate: ExchangeRate = {
      brl,
      fetchedAt: new Date().toISOString(),
      source: 'awesomeapi',
    }
    cached = { rate, expiresAt: now + CACHE_TTL_MS }
    return rate
  } catch (error) {
    console.warn('[usd-brl] fetch falhou:', error instanceof Error ? error.message : error)

    // Cache expirado ainda é melhor que fallback hardcoded
    if (cached) {
      return { ...cached.rate, source: 'cache' }
    }

    return {
      brl: FALLBACK_RATE,
      fetchedAt: new Date().toISOString(),
      source: 'fallback',
    }
  }
}
