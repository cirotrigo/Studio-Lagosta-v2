import { NextRequest, NextResponse } from 'next/server'
import { revokeTokenLineage } from '@/lib/mcp/oauth'

/**
 * Revogação de token (RFC 7009). Aceita access ou refresh token e derruba a
 * linhagem inteira do par cliente/usuário — remover o conector no aplicativo
 * de origem passa a valer também aqui no servidor.
 *
 * Sempre 200 quando o pedido é bem formado, exista o token ou não: a spec
 * manda não vazar existência. 400 só para pedido sem o parâmetro `token`;
 * 503 quando o banco falhou — dizer "revogado" sem ter revogado deixaria o
 * token vivo com o cliente acreditando no contrário.
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
  let token: string | undefined
  try {
    const params = await lerParametros(req)
    token = params.token
    // token_type_hint é aceito e ignorado: procuramos nos dois campos sempre,
    // o que a RFC permite (o hint é só otimização).
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Corpo ilegível' },
      { status: 400 },
    )
  }

  if (!token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'O parâmetro token é obrigatório' },
      { status: 400 },
    )
  }

  try {
    await revokeTokenLineage(token)
  } catch (error) {
    console.error('[oauth/revoke] erro:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 503 })
  }

  return new NextResponse(null, { status: 200 })
}

/** Preflight do navegador do conector. Os headers de CORS vêm do next.config. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
