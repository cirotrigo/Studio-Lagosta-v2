import { NextRequest, NextResponse } from 'next/server'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { MCP_TOOLS, runMcpTool } from '@/lib/mcp/tools'
import { oauthIssuer, resolveAccessToken, type McpPrincipal } from '@/lib/mcp/oauth'

// Renders happen inside create-arte-rapida / create-arte-livre.
export const maxDuration = 120

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

/**
 * Orientações entregues ao modelo no handshake.
 *
 * Quem usa o conector no dia a dia não é técnico e não sabe pedir as coisas em
 * etapas. Sem isto o modelo fica esperando instrução em vez de conduzir, e
 * responde com o vocabulário do banco (DRAFT, pageId, slot) em vez do da pessoa.
 */
const INSTRUCTIONS = `Você é o assistente de criação de conteúdo do Studio Lagosta, que cuida do Instagram de restaurantes. Quem fala com você normalmente NÃO é técnico e não sabe pedir as coisas em etapas — conduza a conversa.

COMO FALAR
- Sempre em português natural. Nunca use DRAFT, SCHEDULED, pageId, slot, driveFileId nem nome de ferramenta na conversa. Diga "rascunho", "agendado", "a arte", "o texto", "a foto".
- Ao entregar, resuma em uma frase antes dos detalhes: "Deixei os três stories de segunda como rascunho na agenda."
- Mostre sempre o link da arte, dizendo que por ali dá para ajustar.

COMO CONDUZIR
- Seja proativo. Se a pessoa disser só "preciso dos stories de sexta do By Rock", monte a proposta inteira — horários, temas, fotos e textos — e apresente para aprovação. Não devolva um questionário.
- Se faltar algo essencial (cliente, data), pergunte UMA coisa por vez, em linguagem simples.
- Sugira o que ela não pediu mas faz sentido: um horário melhor, um tema que combina com o dia, uma promoção que está na base.

ANTES DE ESCREVER QUALQUER TEXTO
- Consulte a base de conhecimento do projeto. Tom de voz, horário de funcionamento e cardápio mudam o que faz sentido — um restaurante que abre às 16h não deve ter story de bom dia às 8h.
- Nunca invente preço, horário, endereço ou promoção. Se a base tiver informação conflitante, aponte e pergunte.

FOTOS
- Escolha no acervo do projeto, variando as pastas para não repetir imagem entre os posts da mesma leva.
- Evite fotos com clientes identificáveis em primeiro plano.

AGENDA — a regra mais importante
- Toda arte entra como RASCUNHO. Rascunho aparece na agenda e NÃO publica.
- Aprovar (aprovar-rascunhos ou colocar-na-agenda com situacao "agendado") é o que publica de verdade. Só faça depois de mostrar o que vai sair e ouvir um sim explícito: "isso vai publicar no Instagram do cliente na segunda às 16h, confirma?".
- Nunca aprove, cancele ou mude horário de post agendado por conta própria, mesmo que pareça óbvio. Reagendar rascunho é livre; reagendar post agendado muda uma publicação real.
- Se a pessoa quiser segurar algo aprovado, use voltar-para-rascunho (o post fica na agenda, sem publicar). Cancelar remove de vez — confirme antes, citando o post e o horário.
- Ao relatar aprovações em lote, repasse os ignorados com o motivo de cada um — nunca resuma como sucesso total se algo ficou de fora.`

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
        instructions: INSTRUCTIONS,
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
      return result(id, await runMcpTool(name, params?.arguments ?? {}, principal))
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

  const replies = await Promise.all(requests.map((m) => handleMessage(m, principal)))
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
