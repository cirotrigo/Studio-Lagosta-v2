import { NextRequest, NextResponse } from 'next/server'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { executarToolRemota, listarToolsRemotas } from '@/lib/mcp/catalogo/integracao'
import { INSTRUCOES } from '@/lib/mcp/instrucoes'
import { oauthIssuer, resolveAccessToken, type McpPrincipal } from '@/lib/mcp/oauth'

// Renders happen inside create-arte-rapida / create-arte-livre; a melhoria
// com IA (melhorar-arte) roda via after() DEPOIS da resposta e precisa que a
// function viva até ~5 min — mesmo teto da rota improve.
export const maxDuration = 300

/**
 * Endpoint MCP remoto (Streamable HTTP, stateless).
 *
 * Duas formas de autenticar:
 *  - Bearer com EXTERNAL_API_SECRET — serviço (Claudinho, scripts, CLI).
 *  - Bearer com token OAuth — conector do claude.ai, amarrado a um usuário
 *    Clerk; as tools só enxergam os projetos daquele usuário.
 *
 * Stateless de propósito: sem session id e sem stream servidor→cliente. GET e
 * DELETE respondem 405, o que o protocolo permite para quem não oferece SSE.
 */

const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18']
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

const SERVER_INFO = { name: 'studio-lagosta', version: '1.0.0' }


type JsonRpcId = string | number | null

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: '2.0' as const, id, result: value }
}

function failure(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } }
}

/**
 * 401 no formato que o cliente MCP espera: o header aponta para os metadados
 * do recurso, e é por ali que o claude.ai descobre onde fazer o login.
 */
function unauthorized() {
  return NextResponse.json(failure(null, -32001, 'Unauthorized'), {
    status: 401,
    headers: {
      'WWW-Authenticate': `Bearer realm="studio-lagosta", resource_metadata="${oauthIssuer()}/.well-known/oauth-protected-resource"`,
    },
  })
}

async function autenticar(req: NextRequest): Promise<McpPrincipal | null> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null

  if (isExternalApiAuthorized(header)) return { kind: 'service' }

  return resolveAccessToken(header.slice('Bearer '.length).trim())
}

async function handleMessage(message: any, principal: McpPrincipal) {
  const { id = null, method, params } = message ?? {}

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCOES,
      })
    }

    case 'ping':
      return result(id, {})

    case 'tools/list':
      return result(id, { tools: listarToolsRemotas() })

    case 'tools/call': {
      const name = params?.name
      if (typeof name !== 'string') {
        return failure(id, -32602, 'params.name é obrigatório')
      }
      return result(id, await executarToolRemota(name, params?.arguments ?? {}, principal))
    }

    default:
      return failure(id, -32601, `Método não suportado: ${method}`)
  }
}

export async function POST(req: NextRequest) {
  const principal = await autenticar(req)
  if (!principal) return unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(failure(null, -32700, 'JSON inválido'), { status: 400 })
  }

  const messages = Array.isArray(body) ? body : [body]

  // Notificações e respostas não têm id e não esperam resposta.
  const requests = messages.filter((m: any) => m && typeof m === 'object' && 'method' in m && m.id !== undefined)
  if (requests.length === 0) {
    return new NextResponse(null, { status: 202 })
  }

  /**
   * SEQUENCIAL, não Promise.all: cada tool valida créditos antes de deduzir, e
   * um batch de 12 gerar-imagem em paralelo fazia as doze validações lerem o
   * MESMO saldo — o desvio que gerar-imagem-lote fecha por dentro entrava pela
   * porta da frente. Batching saiu da spec MCP em 2025-06-18; quando a
   * telemetria mostrar zero arrays chegando, o passo seguinte é recusá-los.
   */
  const replies = []
  for (const m of requests) {
    replies.push(await handleMessage(m, principal))
  }
  return NextResponse.json(Array.isArray(body) ? replies : replies[0])
}

export async function GET() {
  return NextResponse.json(
    failure(null, -32601, 'Este servidor MCP não oferece stream SSE — use POST.'),
    { status: 405 },
  )
}

export async function DELETE() {
  return NextResponse.json(failure(null, -32601, 'Servidor stateless — não há sessão para encerrar.'), {
    status: 405,
  })
}

/** Preflight do navegador do conector. Os headers de CORS vêm do next.config. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
