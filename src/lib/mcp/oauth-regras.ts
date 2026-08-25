/**
 * Regras PURAS do OAuth do conector MCP — audiência (RFC 8707), PKCE e prazos.
 *
 * Sem Prisma de propósito: `@/lib/db` lança no import quando falta
 * DATABASE_URL, e estas são as decisões que scripts/validar-oauth-mcp.ts
 * confere no CI, sem env — mesmo split de page-layers.ts e de
 * sinal-de-agendamento-contrato.ts. `oauth.ts` re-exporta o que os
 * consumidores já importavam de lá.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

export const MCP_SCOPE = 'mcp'

/** Uma hora de validade para o access token. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
export const CODE_TTL_MS = 10 * 60 * 1000

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Origem pública usada nos metadados. Precisa bater exatamente com a URL que o
 * usuário informa no claude.ai, senão a validação do issuer falha.
 */
export function oauthIssuer(): string {
  const url =
    process.env.STUDIO_LAGOSTA_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return url.replace(/\/$/, '')
}

/** Verifica o desafio PKCE (só S256 — plain não é aceito no OAuth 2.1). */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(codeChallenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ─── Audiência (RFC 8707) ───────────────────────────────────────────────────

/**
 * O único recurso para o qual este servidor emite token: o endpoint MCP do
 * issuer. É o que o metadata de recurso protegido (RFC 9728) declara em
 * `resource` — e é de lá que o claude.ai copia o valor que manda de volta no
 * parâmetro `resource`.
 */
export function audienciaEsperada(issuer: string): string {
  return normalizarResource(`${issuer.replace(/\/+$/, '')}/api/mcp`) ?? `${issuer}/api/mcp`
}

/**
 * Forma canônica de um resource para comparação: esquema e host minúsculos e
 * porta default removida (os três vêm de graça do `URL`), barras finais fora.
 * Fragmento é proibido pela RFC 8707 e derruba o valor; query não faz parte
 * de nenhum endpoint nosso e derruba também — null aqui vira `invalid_target`
 * em quem chama.
 */
export function normalizarResource(uri: string): string | null {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hash || url.search) return null
  const caminho = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${caminho}`
}

/** O resource pedido é o endpoint MCP deste issuer? */
export function resourceAceito(resource: string, issuer: string): boolean {
  const normalizado = normalizarResource(resource)
  return normalizado !== null && normalizado === audienciaEsperada(issuer)
}

/**
 * Recusa na porta: audiência gravada que não é o endpoint MCP deste issuer
 * derruba o token. Coluna NULA passa — token anterior à migração continua
 * valendo (migração suave) e ganha audiência na próxima rotação; a recusa só
 * vale quando a coluna está preenchida e diverge.
 */
export function audienciaConfere(gravada: string | null | undefined, issuer: string): boolean {
  if (!gravada) return true
  const normalizada = normalizarResource(gravada)
  return normalizada !== null && normalizada === audienciaEsperada(issuer)
}
