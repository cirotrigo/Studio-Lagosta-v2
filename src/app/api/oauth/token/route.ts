import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
  OAuthError,
} from '@/lib/mcp/oauth'

/**
 * Token endpoint. Aceita application/x-www-form-urlencoded (o que os clientes
 * OAuth mandam) e também JSON, por conveniência.
 */
async function lerParametros(req: NextRequest): Promise<Record<string, string>> {
  const tipo = req.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) {
    return (await req.json()) as Record<string, string>
  }
  const form = await req.formData()
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]))
}

export async function POST(req: NextRequest) {
  try {
    const params = await lerParametros(req)
    const grantType = params.grant_type

    if (grantType === 'authorization_code') {
      const { code, client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier } = params
      if (!code || !clientId || !redirectUri || !codeVerifier) {
        throw new OAuthError(
          'invalid_request',
          'code, client_id, redirect_uri e code_verifier são obrigatórios',
        )
      }
      const tokens = await exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
        // RFC 8707 — opcional: sem ele vale o resource gravado no código.
        resource: params.resource,
      })
      return NextResponse.json(tokens, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (grantType === 'refresh_token') {
      const { refresh_token: refreshToken, client_id: clientId } = params
      if (!refreshToken || !clientId) {
        throw new OAuthError('invalid_request', 'refresh_token e client_id são obrigatórios')
      }
      const tokens = await refreshAccessToken(refreshToken, clientId, params.resource)
      return NextResponse.json(tokens, { headers: { 'Cache-Control': 'no-store' } })
    }

    throw new OAuthError('unsupported_grant_type', `grant_type não suportado: ${grantType}`)
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json(
        { error: error.code, error_description: error.message },
        { status: error.status },
      )
    }
    console.error('[oauth/token] erro:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Preflight do navegador do conector. Os headers de CORS vêm do next.config. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
