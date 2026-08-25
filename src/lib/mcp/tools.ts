/**
 * Tool definitions exposed by the remote MCP endpoint (/api/mcp).
 *
 * These mirror the most useful tools of the local stdio server
 * (scripts/mcp-server.ts) but run inside the deployed app, so any MCP client
 * — a second machine, the CLI, a phone — can ask for a creative without this
 * repo checked out. Both surfaces call the same libs under src/lib, so the
 * behaviour cannot drift.
 */

import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  prepareCreative,
  createArteRapida,
  ajustarArte,
  getPublicAppUrl,
  parseLayers,
} from '@/lib/creatives/arte-rapida'
import { checkTextGeometry } from '@/lib/creatives/text-geometry'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { createArteLivre, listFontCombinations } from '@/lib/creatives/arte-livre'
import { CreativeError } from '@/lib/creatives/errors'
import { registrarUsoDeFoto } from '@/lib/creatives/uso-de-foto'
import { buscarNoAcervo, listarImagensDoDrive } from '@/lib/creatives/acervo'
import { agendarPost, postarAgora } from '@/lib/creatives/agendar'
import { KnowledgeCategory } from '@prisma/client'
import type { McpPrincipal } from '@/lib/mcp/oauth'
import {
  processarAprovacao,
  reagendarPost,
  cancelarPost,
  editarPost,
  formatarBRT,
} from '@/lib/posts/agenda-acoes'
import { trocarArteDoPost } from '@/lib/posts/trocar-arte-do-post'
import { sugerirPosts } from '@/lib/posts/sugerir-posts'
import {
  atualizarItem,
  criarPlano,
  lerPlano,
  planoAtivo,
  MAX_ITENS_POR_PLANO,
} from '@/lib/planos/plano-service'
import { proporSemana } from '@/lib/planos/propor-semana'
import { reconciliarPlano } from '@/lib/planos/reconciliar'
import { executarPlano } from '@/lib/planos/executar-plano'
import { regenerarItem } from '@/lib/planos/regenerar'
import {
  ROTULO_DO_STATUS,
  normalizarStatusDoItem,
  rotuloDaVia,
  type ViaDoItem,
} from '@/lib/planos/vocabulario'
import { avaliarSlotSugerido, fecharDesfechoDoSlot } from '@/lib/aprendizado/desfecho-de-slot'
import { listarFeedbacks, normalizarVeredito } from '@/lib/aprendizado/feedback-de-arte'
import { avisosDeCampanhaVencida } from '@/lib/posts/campanha-vigencia'
import {
  escopoEmPortugues,
  normalizarEscopo,
  type EscopoAprendizado,
} from '@/lib/posts/learning-scope'
import { descreverJanela } from '@/lib/posts/freeze-window'
import { pedirFoto, verFoto } from '@/lib/creatives/chat-upload'
import { reindexEntry } from '@/lib/knowledge/indexer'
import { deleteVectorsByEntry } from '@/lib/knowledge/vector-client'
import { invalidateProjectCache } from '@/lib/knowledge/cache'
import { criarEntradaBase } from '@/lib/knowledge/entries'
import {
  vigenteEm,
  parseValidade,
  avisoValidadeAusente,
  formatarValidade,
} from '@/lib/knowledge/vigencia'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { projectOwnerIdsFor } from '@/lib/projects/access'
import {
  startImprovement,
  VERCEL_BLOB_HOST_REGEX,
} from '@/lib/ai/creative-improvement-service'
import { startArtGeneration } from '@/lib/ai/creative-generation-service'
import type { ArtGenerationReference } from '@/lib/ai/creative-generation-runner'
import { enfileirarArte, enfileirarMelhoria } from '@/lib/ai/generation-queue'
import {
  listarAncoras,
  definirAncora,
  removerAncora,
  AMBIENT_SCENE_TAG,
} from '@/lib/ai/anchor-images'
import {
  definirReferenciaDeEstilo,
  listarReferenciasDeEstilo,
} from '@/lib/ai/style-references'
import {
  iniciarCarrossel,
  confirmarEstiloCarrossel,
  verCarrossel,
  type SlideSpec,
} from '@/lib/ai/carousel-service'
import {
  loadExpectedTextsForGeneration,
  verifyImageTexts,
} from '@/lib/ai/creative-text-verification'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import {
  loadBrandContext,
  updateBrandDNA,
  virarRegra,
  BRAND_DNA_FIELDS,
  BRAND_DNA_MAX_CHARS,
  type BrandDNAField,
} from '@/lib/brand/brand-context'

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, any>, principal: McpPrincipal) => Promise<unknown>
}

/**
 * Organizações de que o usuário PARTICIPA, pelo Clerk.
 *
 * Cache curto por instância: `projetosVisiveis` roda em praticamente toda tool
 * (via `assertProjetoPermitido`), e sem isto cada chamada viraria uma ida à API
 * do Clerk. 60s é bem mais que a duração de uma conversa e bem menos que o
 * tempo de alguém entrar/sair de uma organização e estranhar.
 */
const CACHE_ORGS_MS = 60_000

/** Uma participação: a organização e o papel do portador nela. */
type ParticipacaoEmOrg = { orgId: string; role: string | null }

const cacheDeOrgs = new Map<string, { orgs: ParticipacaoEmOrg[]; ate: number }>()

async function participacoesDoUsuario(clerkUserId: string): Promise<ParticipacaoEmOrg[]> {
  const agora = Date.now()
  const guardado = cacheDeOrgs.get(clerkUserId)
  if (guardado && guardado.ate > agora) return guardado.orgs

  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const lista = await client.users.getOrganizationMembershipList({
      userId: clerkUserId,
      limit: 100,
    })
    const orgs: ParticipacaoEmOrg[] = lista.data.map((m) => ({
      orgId: m.organization.id,
      role: m.role ?? null,
    }))
    cacheDeOrgs.set(clerkUserId, { orgs, ate: agora + CACHE_ORGS_MS })
    return orgs
  } catch (erro) {
    /**
     * Clerk fora do ar NÃO pode virar "enxerga tudo" nem derrubar a conversa:
     * degrada para o que dá para saber só com o banco — os projetos que a
     * pessoa possui. Sem cache, para a próxima chamada tentar de novo.
     *
     * Vale para a CURADORIA também: sem participações, sobra o dono no banco.
     * O erro derruba para MENOS poder, nunca para mais.
     */
    console.warn('[mcp] não consegui listar as organizações do usuário:', erro)
    return []
  }
}

async function orgsDoUsuario(clerkUserId: string): Promise<string[]> {
  return (await participacoesDoUsuario(clerkUserId)).map((p) => p.orgId)
}

/**
 * Projetos que o portador pode ver. O segredo de serviço enxerga tudo (é o
 * Claudinho, que já opera em nome do dono); um token OAuth fica restrito aos
 * projetos do usuário que aprovou o conector.
 *
 * 🔴 MEMBRO da organização conta, não só o DONO dela.
 *
 * A versão anterior olhava apenas `organization.ownerClerkId`, o que deixava o
 * conector MAIS restrito que o resto do sistema: `hasProjectWriteAccess`
 * (`projects/access.ts`) dá acesso a todos os membros de uma organização com
 * que o projeto é compartilhado, e é assim que o app web se comporta. O
 * resultado era um admin da organização abrir o site e ver os 11 clientes, e
 * abrir o conector e ver ZERO — com "Sem acesso ao projeto 6" em cada tool,
 * sem nada que explicasse por quê. Aconteceu de verdade em 12/08/2026.
 */
export async function projetosVisiveis(principal: McpPrincipal): Promise<number[] | null> {
  if (principal.kind === 'service') return null

  // `principal.userId` é clerkId; `Project.userId` é o id INTERNO do User.
  // Comparar direto nunca casava — ver o comentário de espaços de id em
  // src/lib/projects/access.ts.
  const [donoIds, orgs] = await Promise.all([
    projectOwnerIdsFor(principal.userId),
    orgsDoUsuario(principal.userId),
  ])

  const projects = await db.project.findMany({
    where: {
      OR: [
        { userId: { in: donoIds } },
        // Dono da organização — mantido por segurança: se o Clerk falhar, quem
        // é dono no BANCO continua enxergando.
        { organizationProjects: { some: { organization: { ownerClerkId: principal.userId } } } },
        ...(orgs.length > 0
          ? [{ organizationProjects: { some: { organization: { clerkOrgId: { in: orgs } } } } }]
          : []),
      ],
    },
    select: { id: true },
  })
  return projects.map((p) => p.id)
}

/**
 * Diagnóstico de quem está conectado, para o erro parar de ser mudo.
 *
 * Lista vazia e "Sem acesso ao projeto 6" não diziam POR QUÊ, e a causa real —
 * token emitido para outra conta — é invisível de dentro da conversa. Custa uma
 * consulta que só roda quando algo já deu errado.
 */
export async function quemEstaConectado(principal: McpPrincipal): Promise<string> {
  if (principal.kind === 'service') return 'chave de serviço'
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const u = await client.users.getUser(principal.userId)
    const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress
    return email ? `${email} (${principal.userId})` : principal.userId
  } catch {
    return principal.userId
  }
}

/**
 * Resolve quem assina a ação: o User do banco E o id do Clerk, porque cada
 * consumidor pede um espaço de id diferente — escritas na base usam User.id
 * (convenção de createdBy/updatedBy das rotas), créditos exigem o clerkId.
 *
 * Atenção ao espaço de id (verificado nos DADOS em 31/07/2026):
 * - `principal.userId` (token OAuth) é id do CLERK (`user_…`), vindo do
 *   `auth()` da tela de consentimento.
 * - `Project.userId` guarda o id INTERNO do User (cuid) — a versão anterior
 *   deste helper o tratava como clerkId e o getUserFromClerkId CRIAVA um User
 *   fantasma com clerkId=cuid a cada projeto tocado pelo Claudinho. Dois
 *   fantasmas já existem no banco por isso (cmgw866yc…, cms5fv2c5…).
 */
export async function resolverDono(
  projectId: number,
  principal: McpPrincipal,
): Promise<{ id: string; clerkId: string }> {
  if (principal.kind === 'user' && principal.userId) {
    const dbUser = await getUserFromClerkId(principal.userId)
    return { id: dbUser.id, clerkId: principal.userId }
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  let user = await db.user.findUnique({
    where: { id: project.userId },
    select: { id: true, clerkId: true },
  })
  // Projeto antigo pode ter gravado o clerkId na coluna — aceita os dois
  // espaços em vez de inventar um usuário novo.
  if (!user) {
    user = await db.user.findUnique({
      where: { clerkId: project.userId },
      select: { id: true, clerkId: true },
    })
  }
  if (!user) {
    throw new CreativeError(
      'DONO_NAO_ENCONTRADO',
      `O dono do projeto ${projectId} não existe na tabela User (Project.userId=${project.userId}).`,
      500,
    )
  }
  return user
}

/** Autor das escritas na base, como User.id do banco. */
export async function resolverAutor(projectId: number, principal: McpPrincipal): Promise<string> {
  return (await resolverDono(projectId, principal)).id
}

/**
 * Quem decidiu, para a coluna `decididoPor` — `User.id` INTERNO, nunca o
 * clerkId. Nunca propaga erro: isto é auditoria, e um projeto com dono
 * pendurado (`resolverDono` levanta 500) não pode deixar de ser agendado por
 * causa de um campo de registro.
 */
export async function quemDecidiu(
  projectId: number,
  principal: McpPrincipal,
): Promise<string | undefined> {
  try {
    return await resolverAutor(projectId, principal)
  } catch (error) {
    console.error('[mcp] não deu para resolver quem decidiu:', error)
    return undefined
  }
}

/** Barra o acesso a um projeto fora do alcance do portador. */
export async function assertProjetoPermitido(projectId: number, principal: McpPrincipal) {
  const permitidos = await projetosVisiveis(principal)
  if (permitidos && !permitidos.includes(projectId)) {
    /**
     * A mensagem diz QUEM está conectado. "Sem acesso ao projeto 6" sozinho
     * mandava procurar permissão no lugar errado: em 12/08/2026 a causa era o
     * conector autenticado com OUTRA conta, e nada na conversa mostrava isso.
     */
    const quem = await quemEstaConectado(principal)
    throw new CreativeError(
      'PROJETO_SEM_ACESSO',
      permitidos.length === 0
        ? `A conexão está autenticada como ${quem}, e essa conta não enxerga nenhum cliente. Reconecte o Studio Lagosta com a conta dona dos projetos, ou peça para incluírem esta na organização.`
        : `A conta conectada (${quem}) não tem acesso ao cliente ${projectId}. Ela enxerga: ${permitidos.join(', ')}.`,
      403,
    )
  }
}

/**
 * Barra quem não é CURADOR do projeto — dono, ou admin de uma organização com
 * que ele é compartilhado.
 *
 * Existe porque ver um cliente e mandar na CURADORIA dele são coisas
 * diferentes. Promover página a modelo vale para todos que criam arte daquele
 * cliente e entra no pool que `prepareCreative`, `sugerirPosts` e a bancada
 * consultam — por isso a web protege as três portas
 * (`POST /api/projects/[id]/modelos`, `.../template-pages/[pageId]/tags` e,
 * desde 16/08/2026, `toggle-template`) com `hasProjectOwnership`. O conector
 * fazia a MESMA promoção com gate de membro: bastava enxergar o cliente.
 *
 * A tradução para cá tem uma diferença inevitável: no MCP não existe
 * "organização ativa" (o token OAuth traz só o `userId`), então a regra é ser
 * admin de ALGUMA organização com que o projeto é compartilhado, em vez da org
 * da sessão. É o mesmo critério que `projetosVisiveis` já usa para enxergar.
 */
/**
 * A decisão em si, separada da busca das participações no Clerk — é o que
 * permite provar a matriz (dono / admin de org / MEMBRO comum) sem depender de
 * contas reais com papéis diferentes cadastradas lá.
 */
export async function ehCuradorDoProjeto(
  projectId: number,
  clerkUserId: string,
  participacoes: ParticipacaoEmOrg[],
): Promise<boolean> {
  const donoIds = await projectOwnerIdsFor(clerkUserId)

  // Mesma tolerância de nome de papel do `hasProjectOwnership`: qualquer papel
  // que contenha "admin" conta, para custom roles não caírem fora em silêncio.
  const orgsOndeEhAdmin = participacoes
    .filter((p) => !!p.role && p.role.toLowerCase().includes('admin'))
    .map((p) => p.orgId)

  const curador = await db.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId: { in: donoIds } },
        // Dono da organização no BANCO: sobrevive ao Clerk fora do ar, mesmo
        // motivo pelo qual `projetosVisiveis` mantém este ramo.
        { organizationProjects: { some: { organization: { ownerClerkId: clerkUserId } } } },
        ...(orgsOndeEhAdmin.length > 0
          ? [
              {
                organizationProjects: {
                  some: { organization: { clerkOrgId: { in: orgsOndeEhAdmin } } },
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  })
  return !!curador
}

export async function assertCuradorDoProjeto(projectId: number, principal: McpPrincipal) {
  await assertProjetoPermitido(projectId, principal)

  // O segredo de serviço é o Claudinho, que já opera em nome do dono — mesma
  // decisão que faz `projetosVisiveis` devolver null para ele.
  if (principal.kind !== 'user' || !principal.userId) return

  const clerkUserId = principal.userId
  const participacoes = await participacoesDoUsuario(clerkUserId)

  if (!(await ehCuradorDoProjeto(projectId, clerkUserId, participacoes))) {
    const quem = await quemEstaConectado(principal)
    throw new CreativeError(
      'PROJETO_SEM_CURADORIA',
      `A conta conectada (${quem}) enxerga o cliente ${projectId}, mas não pode mexer na curadoria dele — isso vale para todos que criam arte deste cliente. Peça ao dono do projeto (ou a um admin da organização) para fazer a mudança, ou para promoverem esta conta a admin.`,
      403,
    )
  }
}

function requireString(args: Record<string, any>, key: string): string {
  const value = args?.[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`"${key}" é obrigatório`)
  }
  return value
}

function requireNumber(args: Record<string, any>, key: string): number {
  const value = args?.[key]
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new Error(`"${key}" é obrigatório e deve ser numérico`)
  }
  return parsed
}

// ── Plano de conteúdo (F3) ──────────────────────────────────────────────────

/**
 * Resolve QUAL plano a tool vai mexer: o pedido explícito, ou o plano ativo do
 * cliente. Sem plano nenhum, um erro que diz o que fazer em vez de um 404 seco.
 */
export async function resolverPlano(projectId: number, planoId: unknown): Promise<string> {
  if (typeof planoId === 'string' && planoId.trim()) return planoId.trim()
  const ativo = await planoAtivo(projectId)
  if (!ativo) {
    throw new CreativeError(
      'SEM_PLANO_ATIVO',
      'Este cliente não tem nenhuma leva em aberto. Monte uma com criar-plano.',
      404,
    )
  }
  return ativo.id
}

/**
 * O item como `lerPlano` o devolve — com `clienteCitadoNome` OPCIONAL, porque
 * dois chamadores (criar-plano e propor-semana) passam o item recém-criado,
 * que ainda não fez a viagem pelo `lerPlano` e não carrega o derivado.
 */
export type ItemDePlanoParaChat = Omit<
  Awaited<ReturnType<typeof lerPlano>>['itens'][number],
  'clienteCitadoNome'
> & { clienteCitadoNome?: string | null }

/**
 * Um item do plano na língua de quem lê.
 *
 * A regra da casa vale aqui igual à da `ver-agenda`: nada de situação crua nem
 * de hora em UTC na conversa. Os ids continuam vindo porque são o que amarra
 * este item às outras tools (conferir-arte, colocar-na-agenda) — o modelo usa,
 * não fala.
 */
export function itemParaChat(item: ItemDePlanoParaChat, capa?: string | null) {
  const situacao = normalizarStatusDoItem(item.status) ?? 'proposto'
  return {
    itemId: item.id,
    quando: item.quando ? formatarBRT(item.quando) : null,
    tema: item.tema,
    texto: item.copyProposta,
    legenda: item.legenda,
    formato: item.formato,
    via: rotuloDaVia((item.via as ViaDoItem) ?? 'template'),
    situacao: ROTULO_DO_STATUS[situacao],
    ...(item.direcao ? { direcao: item.direcao } : {}),
    ...(item.ajusteDaFoto ? { ajusteDaFoto: item.ajusteDaFoto } : {}),
    // Co-branding: qual marca de cliente entra na peça — quem revisa pelo chat
    // precisa enxergar, igual ao selo do card da bancada.
    ...(item.clienteProjectId
      ? { marcaDoCliente: item.clienteCitadoNome ?? `cliente ${item.clienteProjectId}` }
      : {}),
    ...(item.motivoDoSlot ? { motivoDoHorario: item.motivoDoSlot } : {}),
    ...(item.motivoReprovacao ? { reprovadoPorque: item.motivoReprovacao } : {}),
    ...(item.erro ? { falhou: item.erro } : {}),
    ...(capa ? { arte: capa } : {}),
    ...(item.generationId ? { generationId: item.generationId } : {}),
    ...(item.pageId ? { pageId: item.pageId } : {}),
    ...(item.postId ? { postId: item.postId } : {}),
  }
}

/**
 * Tools AINDA NÃO migradas para o registro (src/lib/mcp/registro + catalogo/).
 *
 * Tool migrada SAI deste array no mesmo PR — o catálogo vence por nome na
 * porta (catalogo/integracao.ts), e deixar a cópia aqui seria uma segunda
 * fonte de verdade esperando divergir.
 *
 * VAZIO desde o PR 5: as 48 tools moram em src/lib/mcp/catalogo/. O array, o
 * dispatcher legado (runMcpTool) e os APELIDOS saem no PR de limpeza — este
 * arquivo fica sendo a casa dos helpers de acesso e identidade.
 */
export const MCP_TOOLS: McpTool[] = []

export const MCP_TOOL_MAP = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]))

/**
 * Nomes antigos, de antes da tradução para português.
 *
 * O cliente MCP guarda a lista de ferramentas de quando o conector foi
 * instalado: sem estes apelidos, renomear derruba todas as conversas já
 * existentes com "Tool desconhecida" até alguém reconectar.
 */
const APELIDOS: Record<string, string> = {
  'list-projects': 'listar-clientes',
  'prepare-creative': 'escolher-modelo',
  'create-arte-rapida': 'criar-arte-de-modelo',
  'list-posts': 'ver-agenda',
  'get-knowledge': 'consultar-base',
  'list-font-combinations': 'listar-combinacoes-de-texto',
  'create-arte-livre': 'criar-arte',
  'search-acervo': 'buscar-fotos',
  'list-drive-images': 'listar-fotos-da-pasta',
  'agendar-post': 'colocar-na-agenda',
  // A6: a tool virou `ver-geracao`; o nome antigo segue valendo para não
  // quebrar conversa em andamento nem skill que já o cite.
  'ver-melhoria': 'ver-geracao',
}

/**
 * Chaves que o schema da tool não declara. Vazio quando o schema não fecha a
 * porta (`additionalProperties` diferente de false) — respeitar a declaração é
 * o que permite uma tool aceitar extras de propósito.
 */
function parametrosDesconhecidos(tool: McpTool, args: Record<string, any> | undefined): string[] {
  const schema = tool.inputSchema as { properties?: Record<string, unknown>; additionalProperties?: unknown }
  if (!schema?.properties || schema.additionalProperties !== false) return []
  return Object.keys(args ?? {}).filter((k) => !(k in schema.properties!))
}

/**
 * Coerção de STRING JSON para o tipo que o schema declara — na PORTA, uma vez,
 * para todas as tools.
 *
 * O cliente MCP às vezes serializa um argumento composto como string
 * (aconteceu em 23/08/2026: `editar-item-do-plano` recebeu `referencias` como
 * `"[{...}]"`). Os handlers leem com `Array.isArray(...)` — 16 pontos — e uma
 * string cai no ramo do descarte EM SILÊNCIO: a tool responde sucesso e o
 * campo simplesmente não é gravado, que é a mesma classe de defeito que a
 * guarda acima existe para impedir. Consertar aqui vale para todos os
 * handlers de uma vez; consertar handler a handler deixaria a próxima tool
 * nova com o mesmo buraco.
 *
 * String que declara array/objeto mas NÃO parseia é recusada pelo chamador
 * natural: o valor coagido fica como veio e o handler/serviço rejeita com a
 * mensagem própria — aqui só se converte o que converte limpo.
 */
export function coagirPeloSchema(tool: McpTool, args: Record<string, any>): Record<string, any> {
  const props = (tool.inputSchema as { properties?: Record<string, { type?: unknown }> })?.properties
  if (!props) return args
  const saida: Record<string, any> = { ...args }
  for (const [chave, valor] of Object.entries(saida)) {
    const tipo = props[chave]?.type
    if (typeof valor !== 'string') continue
    if (tipo !== 'array' && tipo !== 'object') continue
    const texto = valor.trim()
    if (!(tipo === 'array' ? texto.startsWith('[') : texto.startsWith('{'))) continue
    try {
      const parsed = JSON.parse(texto)
      if (tipo === 'array' ? Array.isArray(parsed) : typeof parsed === 'object' && parsed !== null) {
        saida[chave] = parsed
      }
    } catch {
      // Fica como veio — o handler recusa com a mensagem dele.
    }
  }
  return saida
}

/** Runs a tool and shapes the MCP `tools/call` result, errors included. */
export async function runMcpTool(
  name: string,
  args: Record<string, any>,
  principal: McpPrincipal = { kind: 'service' },
) {
  const tool = MCP_TOOL_MAP.get(name) ?? MCP_TOOL_MAP.get(APELIDOS[name] ?? '')
  if (!tool) {
    return {
      content: [{ type: 'text' as const, text: `Ferramenta desconhecida: ${name}` }],
      isError: true,
    }
  }

  /**
   * B4: parâmetro desconhecido é RECUSADO, não descartado em silêncio.
   *
   * Todo `inputSchema` daqui já declara `additionalProperties: false` — mas
   * nada enforçava, e o handler lia só o que conhecia. Na prática isso vira
   * resposta plausível e ERRADA: chamar a listagem do acervo com um filtro que
   * a tool não tem devolvia o acervo inteiro misturado, com cara de resultado
   * válido. Recusar cedo, dizendo o que existe, custa uma tentativa; o
   * silêncio custa uma decisão tomada em cima de dado errado.
   */
  const desconhecidos = parametrosDesconhecidos(tool, args)
  if (desconhecidos.length > 0) {
    const aceitos = Object.keys(tool.inputSchema?.properties ?? {}).join(', ')
    return {
      content: [
        {
          type: 'text' as const,
          text:
            `A ferramenta ${tool.name} não conhece ${desconhecidos.map((d) => `"${d}"`).join(', ')}. ` +
            `Os parâmetros aceitos são: ${aceitos}.`,
        },
      ],
      isError: true,
    }
  }

  try {
    const result = await tool.handler(coagirPeloSchema(tool, args ?? {}), principal)
    // Tools visuais (conferir-arte) devolvem blocos de conteúdo prontos —
    // texto + imagem — em vez de um JSON para serializar.
    if (
      result &&
      typeof result === 'object' &&
      Array.isArray((result as Record<string, unknown>)._mcpContent)
    ) {
      return { content: (result as { _mcpContent: Array<Record<string, unknown>> })._mcpContent }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    const text =
      error instanceof CreativeError
        ? JSON.stringify(error.toJSON(), null, 2)
        : `Erro: ${error instanceof Error ? error.message : String(error)}`
    console.error(`[mcp] tool ${name} falhou:`, error)
    return { content: [{ type: 'text' as const, text }], isError: true }
  }
}
