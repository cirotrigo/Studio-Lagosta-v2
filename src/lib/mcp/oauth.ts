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
 *
 * As regras PURAS (audiência RFC 8707, PKCE, prazos) moram em
 * ./oauth-regras.ts e são re-exportadas daqui — é o que deixa
 * scripts/validar-oauth-mcp.ts conferi-las no CI sem DATABASE_URL.
 */

import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import {
  ACCESS_TOKEN_TTL_MS,
  CODE_TTL_MS,
  MCP_SCOPE,
  audienciaConfere,
  audienciaEsperada,
  normalizarResource,
  oauthIssuer,
  prazoDoRefresh,
  refreshVencido,
  resourceAceito,
  sha256,
  verifyPkce,
} from './oauth-regras'

export { MCP_SCOPE, oauthIssuer, sha256, verifyPkce }

function randomToken(): string {
  return randomBytes(32).toString('base64url')
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
  /** Resource (RFC 8707) já validado e NORMALIZADO por quem chama. */
  resource?: string | null
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
      resource: params.resource ?? null,
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

async function issueTokens(
  clientId: string,
  userId: string,
  scope: string,
  audience: string | null,
): Promise<IssuedTokens> {
  const accessToken = randomToken()
  const refreshToken = randomToken()

  await db.mcpOAuthToken.create({
    data: {
      tokenHash: sha256(accessToken),
      refreshHash: sha256(refreshToken),
      clientId,
      userId,
      scope,
      audience,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: prazoDoRefresh(),
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

/** `invalid_target` é o erro que a RFC 8707 manda para resource não aceito. */
function exigirResourceAceito(resource: string | undefined): string | null {
  if (!resource) return null
  if (!resourceAceito(resource, oauthIssuer())) {
    throw new OAuthError(
      'invalid_target',
      `resource não aceito — o endpoint deste servidor é ${audienciaEsperada(oauthIssuer())}`,
    )
  }
  return normalizarResource(resource)
}

/** Troca o código pelo token, validando PKCE, cliente, redirect e uso único. */
export async function exchangeAuthorizationCode(params: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  /** Resource (RFC 8707) repetido na troca; opcional — o do código vale sem ele. */
  resource?: string
}): Promise<IssuedTokens> {
  const audienciaPedida = exigirResourceAceito(params.resource)

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

  return issueTokens(
    registro.clientId,
    registro.userId,
    registro.scope ?? MCP_SCOPE,
    audienciaPedida ?? registro.resource,
  )
}

/** Rotaciona o refresh token, revogando o anterior. */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  resource?: string,
): Promise<IssuedTokens> {
  const audienciaPedida = exigirResourceAceito(resource)

  const registro = await db.mcpOAuthToken.findUnique({ where: { refreshHash: sha256(refreshToken) } })

  if (!registro || registro.revokedAt) throw new OAuthError('invalid_grant', 'Refresh token inválido')
  if (registro.clientId !== clientId) throw new OAuthError('invalid_grant', 'Refresh token de outro cliente')
  if (refreshVencido(registro.refreshExpiresAt)) {
    // 401 deliberado (a spec usaria 400): é o sinal de "refaça o login" — o
    // cliente abandona o refresh e volta ao fluxo de autorização normal.
    throw new OAuthError('invalid_grant', 'Refresh token vencido — reconecte o aplicativo', 401)
  }

  await db.mcpOAuthToken.update({ where: { id: registro.id }, data: { revokedAt: new Date() } })

  // A audiência é herdada na rotação — é assim que token anterior à migração
  // (coluna nula) ganha carimbo sem ninguém reconectar.
  return issueTokens(
    registro.clientId,
    registro.userId,
    registro.scope ?? MCP_SCOPE,
    audienciaPedida ?? registro.audience ?? audienciaEsperada(oauthIssuer()),
  )
}

/**
 * Revogação (RFC 7009): derruba a LINHAGEM inteira do par cliente/usuário —
 * o mesmo alcance do replay de código. Vale para access ou refresh token;
 * possuir o token é a credencial (clientes são públicos, sem secret).
 *
 * Devolve false quando o token não existe — a rota responde 200 do mesmo
 * jeito, como a spec manda: revogação não vaza existência de token.
 */
export async function revokeTokenLineage(token: string): Promise<boolean> {
  const hash = sha256(token)
  const registro = await db.mcpOAuthToken.findFirst({
    where: { OR: [{ tokenHash: hash }, { refreshHash: hash }] },
  })
  if (!registro) return false

  await db.mcpOAuthToken.updateMany({
    where: { clientId: registro.clientId, userId: registro.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return true
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
  // RFC 8707: token carimbado para outro endpoint não vale aqui. Coluna nula
  // passa (token antigo — migração suave).
  if (!audienciaConfere(registro.audience, oauthIssuer())) return null
  return { kind: 'user', userId: registro.userId, clientId: registro.clientId }
}
