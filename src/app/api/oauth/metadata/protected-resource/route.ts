import { NextResponse } from 'next/server'
import { oauthIssuer, MCP_SCOPE } from '@/lib/mcp/oauth'

/**
 * Metadados do recurso protegido (RFC 9728) — diz ao cliente MCP qual
 * authorization server usar. Servido em /.well-known/oauth-protected-resource
 * (e no caminho com sufixo /api/mcp) via rewrite.
 */
export async function GET() {
  const issuer = oauthIssuer()

  return NextResponse.json(
    {
      resource: `${issuer}/api/mcp`,
      authorization_servers: [issuer],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ['header'],
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
