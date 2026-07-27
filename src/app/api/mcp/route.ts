import { NextRequest, NextResponse } from 'next/server'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { MCP_TOOLS, runMcpTool } from '@/lib/mcp/tools'

// Renders happen inside create-arte-rapida.
export const maxDuration = 120

/**
 * Remote MCP endpoint (Streamable HTTP, stateless).
 *
 * Lets any MCP client reach the Studio without this repo checked out — a
 * second machine, the CLI, a phone. Same tools and same libs as the local
 * stdio server in scripts/mcp-server.ts.
 *
 * Auth is a bearer token (EXTERNAL_API_SECRET), which works with clients that
 * accept a custom header, e.g.:
 *   claude mcp add --transport http studio https://<host>/api/mcp \
 *     --header "Authorization: Bearer <EXTERNAL_API_SECRET>"
 *
 * Stateless by design: no session ids, no server→client stream. GET/DELETE
 * answer 405, which the spec allows for servers that don't offer SSE.
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

async function handleMessage(message: any) {
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
      })
    }

    case 'ping':
      return result(id, {})

    case 'tools/list':
      return result(id, {
        tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })

    case 'tools/call': {
      const name = params?.name
      if (typeof name !== 'string') {
        return failure(id, -32602, 'params.name é obrigatório')
      }
      return result(id, await runMcpTool(name, params?.arguments ?? {}))
    }

    default:
      return failure(id, -32601, `Método não suportado: ${method}`)
  }
}

export async function POST(req: NextRequest) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json(failure(null, -32001, 'Unauthorized'), { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(failure(null, -32700, 'JSON inválido'), { status: 400 })
  }

  const messages = Array.isArray(body) ? body : [body]

  // Notifications and responses carry no id and expect no reply.
  const requests = messages.filter((m: any) => m && typeof m === 'object' && 'method' in m && m.id !== undefined)
  if (requests.length === 0) {
    return new NextResponse(null, { status: 202 })
  }

  const replies = await Promise.all(requests.map(handleMessage))
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
