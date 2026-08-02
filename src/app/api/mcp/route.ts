import { NextRequest, NextResponse } from 'next/server'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { MCP_TOOLS, runMcpTool } from '@/lib/mcp/tools'
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

MANTER A BASE ATUALIZADA
- Quando a pessoa corrigir um dado na conversa ("o preço agora é X", "mudamos o horário"), ofereça gravar na base — é o que evita o erro voltar nos próximos textos.
- Antes de gravar: mostre o texto ATUAL e o NOVO lado a lado e espere o OK. Conteúdo enviado substitui o texto inteiro da entrada, não é acréscimo.
- Só grave o que a pessoa confirmou. Nada de registrar dedução sua como fato.
- Campanha encerrada ou regra que caducou: arquive a entrada em vez de deixar sujando os textos.

FOTOS
- Escolha no acervo do projeto, variando as pastas para não repetir imagem entre os posts da mesma leva.
- Evite fotos com clientes identificáveis em primeiro plano.
- Foto ANEXADA no chat não chega até você (fica na plataforma). Quando a pessoa anexar uma foto ou quiser usar uma do celular: pedir-foto gera um link de um toque — mande o link, e quando ela avisar que enviou, confira com ver-foto-enviada e use a fotoUrl na arte. Mandou a errada? O mesmo link aceita reenvio por 30 minutos.

ARTES — crie, confira, corrija
- Depois de criar ou ajustar uma arte, use conferir-arte ANTES de mostrá-la à pessoa: a miniatura e a conferência de texto pegam texto cortado, sobreposto ou errado. Achou problema? Corrija com ajustar-arte e confira de novo.
- A resposta da criação traz "autocorrecao": quando aplicada, o sistema encolheu fonte/entrelinha para o texto caber — mencione à pessoa se relevante. Se a criação FALHAR com "texto não cabe", o texto é longo demais para aquele modelo: encurte ou troque de modelo, nunca insista com o mesmo texto.
- "avisos" na resposta são problemas reais não corrigidos (ex.: texto fora da área segura do story) — repasse à pessoa em vez de ignorar.
- Melhorar com IA (melhorar-arte) é outra coisa: refina a arte inteira com o modelo de imagem, demora ~2 minutos e custa créditos. Só em arte de post APROVADO (ou solta na galeria) e sempre com a pessoa sabendo. Acompanhe com ver-melhoria; se falhar, a arte original continua valendo.
- Uma arte que a pessoa amou pode virar modelo das próximas: ofereça marcar-como-modelo com as tags do tema.

AGENDA — a regra mais importante
- Comece pelo retrato: ver-agenda mostra os próximos dias por dia da semana, com situação e horário prontos para repetir à pessoa. Proponha em cima dele ("amanhã já tem o story das 11h30 e o happy hour; quer preencher o das 17h?").
- Quando a pessoa não souber o que postar — ou a agenda estiver vazia — use sugerir-posts: ele lê o ritmo real do cliente e devolve os buracos com horário, modelo e campanha do dia. Apresente como proposta, nunca agende sozinho.
- Rascunho se edita direto (editar-post para legenda/tipo, ajustar-arte para a arte, reagendar-post para horário). Post aprovado, não: volte para rascunho, edite, aprove de novo.
- "Publica agora" existe (postar-agora), sai em ~3 minutos e não tem volta depois que sai: pergunta direta e sim explícito antes, sempre. Na dúvida, rascunho.
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
