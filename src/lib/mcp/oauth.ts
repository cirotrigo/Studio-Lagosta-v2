/**
 * OAuth 2.1 do endpoint MCP — o que o claude.ai exige para conectar como
 * conector custom.
 *
 * Fluxo: o conector se registra sozinho (RFC 7591), manda o usuário para a
 * tela de consentimento, recebe um código com PKCE e troca por um token. O
 * token fica amarrado ao usuário Clerk que aprovou, então cada conector só
 * enxerga os projetos daquele usuário.
 *
 * Tokens são guardados só como hash — o valor em claro existe apenas na
 * resposta ao cliente.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

/** Uma hora de validade para o access token; refresh token não expira sozinho. */
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
const CODE_TTL_MS = 10 * 60 * 1000

export const MCP_SCOPE = 'mcp'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function randomToken(): string {
  return randomBytes(32).toString('base64url')
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

/**
 * Registro dinâmico de cliente. Sem client_secret: conectores são clientes
 * públicos e se protegem com PKCE.
 */
export async function registerClient(name: string, redirectUris: string[]) {
  return db.mcpOAuthClient.create({
    data: { name: name.slice(0, 200), redirectUris },
  })
}

export async function findClient(clientId: string) {
  return db.mcpOAuthClient.findUnique({ where: { id: clientId } })
}

/** Emite o código de autorização depois do usuário aprovar na tela de consentimento. */
export async function issueAuthorizationCode(params: {
  clientId: string
  userId: string
  redirectUri: string
  codeChallenge: string
  scope?: string
}): Promise<string> {
  const code = randomToken()
  await db.mcpOAuthCode.create({
    data: {
      code: sha256(code),
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scope: params.scope ?? MCP_SCOPE,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  })
  return code
}

export interface IssuedTokens {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
}

async function issueTokens(clientId: string, userId: string, scope: string): Promise<IssuedTokens> {
  const accessToken = randomToken()
  const refreshToken = randomToken()

  await db.mcpOAuthToken.create({
    data: {
      tokenHash: sha256(accessToken),
      refreshHash: sha256(refreshToken),
      clientId,
      userId,
      scope,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
  })

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope,
  }
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

/** Troca o código pelo token, validando PKCE, cliente, redirect e uso único. */
export async function exchangeAuthorizationCode(params: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}): Promise<IssuedTokens> {
  const registro = await db.mcpOAuthCode.findUnique({ where: { code: sha256(params.code) } })

  if (!registro) throw new OAuthError('invalid_grant', 'Código inválido')
  if (registro.usedAt) {
    // Código reapresentado: revoga o que saiu dele, como manda o OAuth 2.1
    await db.mcpOAuthToken.updateMany({
      where: { clientId: registro.clientId, userId: registro.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    throw new OAuthError('invalid_grant', 'Código já utilizado')
  }
  if (registro.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Código expirado')
  if (registro.clientId !== params.clientId) throw new OAuthError('invalid_grant', 'Código de outro cliente')
  if (registro.redirectUri !== params.redirectUri) {
    throw new OAuthError('invalid_grant', 'redirect_uri diferente do usado na autorização')
  }
  if (!verifyPkce(params.codeVerifier, registro.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'code_verifier não confere')
  }

  await db.mcpOAuthCode.update({ where: { code: registro.code }, data: { usedAt: new Date() } })

  return issueTokens(registro.clientId, registro.userId, registro.scope ?? MCP_SCOPE)
}

/** Rotaciona o refresh token, revogando o anterior. */
export async function refreshAccessToken(refreshToken: string, clientId: string): Promise<IssuedTokens> {
  const registro = await db.mcpOAuthToken.findUnique({ where: { refreshHash: sha256(refreshToken) } })

  if (!registro || registro.revokedAt) throw new OAuthError('invalid_grant', 'Refresh token inválido')
  if (registro.clientId !== clientId) throw new OAuthError('invalid_grant', 'Refresh token de outro cliente')

  await db.mcpOAuthToken.update({ where: { id: registro.id }, data: { revokedAt: new Date() } })

  return issueTokens(registro.clientId, registro.userId, registro.scope ?? MCP_SCOPE)
}

export interface McpPrincipal {
  /** 'service' = segredo compartilhado (Claudinho); 'user' = token OAuth */
  kind: 'service' | 'user'
  userId?: string
  clientId?: string
}

/** Resolve o portador de um access token OAuth, se válido. */
export async function resolveAccessToken(token: string): Promise<McpPrincipal | null> {
  const registro = await db.mcpOAuthToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!registro || registro.revokedAt) return null
  if (registro.expiresAt < new Date()) return null
  return { kind: 'user', userId: registro.userId, clientId: registro.clientId }
}
