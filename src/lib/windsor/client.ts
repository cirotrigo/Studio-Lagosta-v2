/**
 * Cliente REST do Windsor.ai — a fonte de métricas para o que o token próprio
 * do Instagram não alcança (clientes sem token), para anúncios (Meta Ads) e
 * para avaliações do Google Meu Negócio.
 *
 * GET https://connectors.windsor.ai/{connector}?fields=a,b,c&date_preset=…
 * ⚠️ A chave vai em QUERY PARAM (`api_key`) porque é o ÚNICO método que a API
 * aceita de verdade — a doc pública promete X-Api-Key e Bearer, mas ambos
 * respondem 400 "Not authorized" (medido em 30/08/2026). Consequência: nunca
 * logar a URL completa de uma chamada ao Windsor. Resposta: { data: [...] }.
 *
 * Regras da casa que valem aqui:
 * - Fonte de métrica NUNCA derruba fluxo principal (contrato do
 *   sendWhatsAppText): quem chama embrulha em try/catch; este módulo lança
 *   erros LEGÍVEIS para o catch logar.
 * - Os fields vêm do vocabulário do conector (conferidos contra o get_fields
 *   do Windsor em 30/08/2026) — não inventar nome de campo.
 * - Limites da API: 600 req/min, 10.000/dia. A coleta inteira da carteira
 *   custa < 20 requisições por rodada; sem necessidade de fila.
 */

const BASE_URL = 'https://connectors.windsor.ai'

export function isWindsorConfigured(): boolean {
  return !!process.env.WINDSOR_API_KEY
}

export interface WindsorQuery {
  fields: string[]
  /** Ex.: "last_7d", "last_60d". */
  datePreset?: string
  dateFrom?: string
  dateTo?: string
  /** Estrutura de filtro do Windsor, ex.: [["review_reply_comment","notnull",null]] */
  filters?: unknown[]
  maxRows?: number
}

/**
 * Uma consulta ao Windsor. Lança em falta de chave, HTTP != 2xx ou corpo
 * inesperado — o chamador decide se a falha é fatal (script) ou só log (cron).
 */
export async function windsorGet(
  connector: string,
  query: WindsorQuery,
): Promise<Array<Record<string, unknown>>> {
  const apiKey = process.env.WINDSOR_API_KEY
  if (!apiKey) throw new Error('WINDSOR_API_KEY ausente no ambiente')

  const params = new URLSearchParams({ fields: query.fields.join(','), api_key: apiKey })
  if (query.datePreset) params.set('date_preset', query.datePreset)
  if (query.dateFrom) params.set('date_from', query.dateFrom)
  if (query.dateTo) params.set('date_to', query.dateTo)
  if (query.filters) params.set('filter', JSON.stringify(query.filters))
  if (query.maxRows) params.set('_max_rows', String(query.maxRows))

  const res = await fetch(`${BASE_URL}/${connector}?${params}`, {
    // Métricas mudam devagar; o fetch do Next não deve cachear coleta.
    cache: 'no-store',
  })
  if (!res.ok) {
    const corpo = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`Windsor ${connector} respondeu HTTP ${res.status}: ${corpo}`)
  }
  const json = (await res.json()) as { data?: unknown; result?: unknown }
  // A doc pública mostra { data: [...] }; o MCP deles devolve { result: [...] }.
  const rows = json.data ?? json.result
  if (!Array.isArray(rows)) {
    throw new Error(`Windsor ${connector} devolveu corpo sem lista (chaves: ${Object.keys(json).join(', ')})`)
  }
  return rows as Array<Record<string, unknown>>
}

/** Número defensivo: o Windsor devolve numéricos, mas null quando não há dado. */
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function texto(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null
}
