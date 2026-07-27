import { NextResponse } from 'next/server'
import { oauthIssuer, MCP_SCOPE } from '@/lib/mcp/oauth'

/**
 * Metadados do authorization server (RFC 8414).
 * Servido em /.well-known/oauth-authorization-server via rewrite.
 */
export async function GET() {
  const issuer = oauthIssuer()

  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [MCP_SCOPE],
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
