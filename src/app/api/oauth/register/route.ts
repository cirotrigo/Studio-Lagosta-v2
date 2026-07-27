import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { registerClient } from '@/lib/mcp/oauth'

/**
 * Registro dinâmico de cliente (RFC 7591). O claude.ai chama isto sozinho,
 * antes do primeiro login, para obter um client_id.
 *
 * Aberto por definição — é o que o protocolo prevê. O que protege o acesso é
 * a tela de consentimento: nenhum token sai daqui sem um usuário logado no
 * Studio aprovar. Só aceitamos redirect_uris https (localhost liberado para
 * desenvolvimento), para o código não poder ser desviado.
 */
const registerSchema = z.object({
  client_name: z.string().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
})

function redirectUriPermitida(uri: string): boolean {
  try {
    const url = new URL(uri)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json())

    const invalidas = body.redirect_uris.filter((uri) => !redirectUriPermitida(uri))
    if (invalidas.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_redirect_uri',
          error_description: `redirect_uri precisa ser https (ou localhost): ${invalidas.join(', ')}`,
        },
        { status: 400 },
      )
    }

    const client = await registerClient(body.client_name ?? 'Cliente MCP', body.redirect_uris)

    return NextResponse.json(
      {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_client_metadata', error_description: error.errors[0]?.message },
        { status: 400 },
      )
    }
    console.error('[oauth/register] erro:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
