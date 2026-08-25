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
async function resolverAutor(projectId: number, principal: McpPrincipal): Promise<string> {
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
 * fonte de verdade esperando divergir. Já migradas: listar-clientes,
 * criar-arte-de-modelo, a agenda inteira (ver-agenda, sugerir-posts,
 * colocar-na-agenda, postar-agora, aprovar-rascunhos, voltar-para-rascunho,
 * editar-post, trocar-arte-do-post, reagendar-post, cancelar-post), o ciclo
 * do plano (propor-semana, criar-plano, ver-plano, editar-item-do-plano,
 * regenerar-item, executar-plano, listar-combinacoes-de-texto) e a arte por
 * IA (escolher-modelo, criar-arte, ajustar-arte, conferir-arte, melhorar-arte,
 * ver-geracao, gerar-imagem, gerar-imagem-lote, marcar-referencia-de-estilo,
 * criar-carrossel, confirmar-estilo-carrossel, ver-carrossel).
 */
export const MCP_TOOLS: McpTool[] = [
  {
    name: 'consultar-base',
    description:
      'Base de conhecimento do cliente: tom de voz, horário de funcionamento, cardápio, diferenciais e campanhas. CONSULTE SEMPRE antes de escrever qualquer texto — é o que evita prometer horário errado ou inventar preço. Se achar informação conflitante, aponte para a pessoa em vez de escolher sozinho.\n\nEntrada com validade vencida não aparece aqui. Cada entrada traz `validade` quando tem prazo — se você está escrevendo para uma data FUTURA, confira se a campanha ainda estará no ar naquele dia.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        category: {
          type: 'string',
          enum: Object.values(KnowledgeCategory),
          description: 'Filtra por categoria. Omita para trazer tudo.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      await assertProjetoPermitido(requireNumber(args, 'projectId'), principal)
      const category = typeof args.category === 'string' ? (args.category as KnowledgeCategory) : undefined
      const entries = await db.knowledgeBaseEntry.findMany({
        where: {
          projectId: requireNumber(args, 'projectId'),
          status: 'ACTIVE',
          // Campanha vencida não pode alimentar texto nenhum. O cron diário
          // arquiva, mas ele roda uma vez por dia — o filtro é o que garante
          // que ninguém leia a entrada nas horas entre o vencimento e a faxina.
          ...vigenteEm(),
          ...(category ? { category } : {}),
        },
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          tags: true,
          updatedAt: true,
          expiresAt: true,
        },
        orderBy: { category: 'asc' },
      })
      return {
        count: entries.length,
        entries: entries.map(({ expiresAt, ...resto }) => ({
          ...resto,
          validade: expiresAt ? formatarValidade(expiresAt) : null,
        })),
      }
    },
  },

  {
    name: 'consultar-dna',
    description:
      'DNA da marca do cliente: tom de voz, regras, composição/layout, estilo visual e direção fotográfica — mais o que o sistema injeta sozinho (fontes, cores, logo) e a biblioteca de elementos gráficos do projeto (ícones, selos, formas, ornamentos), cada um com `url` própria. O DNA entra em TODA geração de copy e arte, sempre; a base de conhecimento é o conteúdo pesquisável (horários, cardápio, campanhas).\n\nUse a `url` do elemento como está ao montar arte (ajustar-arte, camada de imagem) — é o arquivo oficial da biblioteca, então a arte acompanha sozinha qualquer troca feita no painel; cópia hospedada por fora congela a versão de hoje.\n\nConsulte antes de escrever textos para o cliente, e SEMPRE antes de atualizar-dna — você precisa mostrar à pessoa o que já existe.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const brand = await loadBrandContext(projectId)
      if (!brand) {
        throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
      }
      const secoesVazias = BRAND_DNA_FIELDS.filter((f) => !brand.dna[f])
      // Lido aqui, e não no loadBrandContext: a biblioteca de elementos é para
      // MONTAR arte, não entra em prompt nenhum — carregá-la no loader faria
      // toda geração de copy pagar por linhas que ninguém lê.
      const elementos = await db.element.findMany({
        where: { projectId },
        select: { id: true, name: true, category: true, fileUrl: true },
        orderBy: [{ category: 'asc' }, { id: 'asc' }],
      })
      return {
        ...brand,
        elementos: elementos.map((e) => ({
          id: e.id,
          nome: e.name,
          categoria: e.category,
          url: e.fileUrl,
        })),
        // O modelo tende a não notar ausência — apontar o que falta transforma
        // a consulta num convite para completar o DNA com a pessoa.
        secoesVazias,
        dica:
          secoesVazias.length > 0
            ? `Seções ainda vazias: ${secoesVazias.join(', ')}. Se fizer sentido na conversa, ofereça preencher com atualizar-dna.`
            : 'DNA completo. Use-o como lei ao escrever para este cliente.',
      }
    },
  },

  {
    name: 'atualizar-dna',
    description:
      'Atualiza o DNA da marca — a identidade que passa a valer em TODA geração de copy e arte deste cliente, do chat e do site. Seções: toneOfVoice (como a marca fala), contentRules (o que nunca fazer/dizer), composition (layout e hierarquia), visualStyle (estética geral), photoDirection (luz e tratamento de foto).\n\nCada seção enviada SUBSTITUI o texto inteiro dela — não é acréscimo. Fluxo obrigatório: consultar-dna → mostrar à pessoa o texto ATUAL e o NOVO → só gravar com o OK explícito. Enviar null limpa a seção.\n\nNão confunda com a base de conhecimento: horário, cardápio, preço e campanha vão em criar-entrada-base; identidade vai aqui.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        toneOfVoice: { type: ['string', 'null'], description: 'Como a marca fala (usado em copies e chat). null limpa.' },
        contentRules: { type: ['string', 'null'], description: 'O que nunca fazer ou dizer (usado em copies, chat e artes). null limpa.' },
        composition: { type: ['string', 'null'], description: 'Como os elementos se organizam nas artes. null limpa.' },
        visualStyle: { type: ['string', 'null'], description: 'A estética geral da marca (usado nas artes). null limpa.' },
        photoDirection: { type: ['string', 'null'], description: 'Luz e tratamento fotográfico (usado nas artes). null limpa.' },
        approvalChecklist: {
          type: ['string', 'null'],
          description:
            'Crivo de aprovação: perguntas binárias, UMA POR LINHA, conferidas por gente antes de agendar. NÃO entra em prompt de geração. null limpa.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const patch: Partial<Record<BrandDNAField, string | null>> = {}
      for (const field of BRAND_DNA_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(args, field)) continue
        const value = args[field]
        if (value !== null && typeof value !== 'string') {
          throw new Error(`${field} deve ser texto ou null.`)
        }
        if (typeof value === 'string' && value.length > BRAND_DNA_MAX_CHARS) {
          throw new Error(
            `${field} passou de ${BRAND_DNA_MAX_CHARS} caracteres. O DNA é síntese, não arquivo — resuma; detalhe factual vai para a base de conhecimento.`,
          )
        }
        patch[field] = value
      }
      if (Object.keys(patch).length === 0) {
        throw new Error(
          `Envie pelo menos uma seção (${BRAND_DNA_FIELDS.join(', ')}).`,
        )
      }

      const dna = await updateBrandDNA(projectId, patch)
      const alteradas = Object.keys(patch).join(', ')
      return {
        atualizado: true,
        dna,
        mensagem: `DNA atualizado (${alteradas}). Já vale para as próximas gerações — do chat e do site.`,
      }
    },
  },

  {
    name: 'virar-regra',
    description:
      'Transforma uma correção que a pessoa aprovou na conversa numa regra que vale daqui para a frente. Use quando alguém corrigir a arte ou o texto e a correção não for só para aquela peça.\n\n⚖️ TRIAGEM, antes de chamar: **regra temporária ou de campanha → base de conhecimento com validade** (mande `validade`; ex: "durante o Festival Italiano o rótulo aparece na foto"). **Identidade permanente da marca → DNA** (mande `secao`; ex: "a logo sempre no canto direito", "nunca escrever preço em vermelho"). O DNA é eterno e entra em TODO prompt — regra com prazo ali continuaria mandando meses depois do fim da campanha, e ninguém lembraria de tirar. Na dúvida, pergunte à pessoa até quando a regra vale.\n\nNo DNA a regra é ACRESCENTADA ao fim da seção, o texto que já existia fica intacto (diferente de atualizar-dna, que substitui).\n\nFluxo: chame primeiro sem `confirmado` para ver a proposta, mostre à pessoa o que será gravado e só então chame com `confirmado: true`. Nunca registre dedução sua como regra — só o que a pessoa confirmou.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        secao: {
          type: 'string',
          enum: [...BRAND_DNA_FIELDS],
          description:
            'Onde a regra mora no DNA: contentRules (proibições), composition (layout), visualStyle (estética), photoDirection (foto), toneOfVoice (texto), approvalChecklist (crivo). Obrigatória para regra PERMANENTE; dispensável quando você manda validade.',
        },
        regra: {
          type: 'string',
          description: 'A regra na forma imperativa, como deve valer daqui para a frente.',
        },
        motivo: {
          type: 'string',
          description: 'O caso concreto que gerou a regra. Sem motivo a regra não se explica daqui a três meses.',
        },
        validade: {
          type: 'string',
          description:
            'Último dia em que a regra vale (AAAA-MM-DD). Manda a regra para a base de conhecimento, categoria CAMPANHAS, em vez do DNA — ela deixa de valer sozinha depois dessa data.',
        },
        titulo: {
          type: 'string',
          description: 'Título da entrada na base, quando a regra tem validade (ex: "Festival Italiano — agosto"). Opcional.',
        },
        confirmado: {
          type: 'boolean',
          description: 'Só grava com true. Sem isto devolve a proposta para você mostrar à pessoa.',
        },
      },
      required: ['projectId', 'regra', 'motivo'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const validade = parseValidade(args.validade) ?? null
      const secao = typeof args.secao === 'string' ? (args.secao as BrandDNAField) : undefined
      if (secao && !BRAND_DNA_FIELDS.includes(secao)) {
        throw new Error(`Seção inválida: ${String(args.secao)}. Use uma de ${BRAND_DNA_FIELDS.join(', ')}.`)
      }

      const resultado = await virarRegra({
        projectId,
        secao,
        regra: String(args.regra ?? ''),
        motivo: String(args.motivo ?? ''),
        validade,
        titulo: typeof args.titulo === 'string' ? args.titulo : undefined,
        // Só o ramo com prazo escreve na base, e só ele precisa de autor.
        autor: validade ? await resolverAutor(projectId, principal) : undefined,
        confirmado: args.confirmado === true,
      })

      if (resultado.destino === 'base') {
        return {
          ...resultado,
          validade: formatarValidade(resultado.validade),
          mensagem: resultado.gravado
            ? `Regra guardada na base como campanha, valendo até ${formatarValidade(resultado.validade)}. Depois disso ela para de valer sozinha — não vai para o DNA justamente por ter prazo.`
            : `Proposta montada, NADA foi gravado ainda. Como a regra tem prazo, ela vai para a base de conhecimento (campanha), não para o DNA. Mostre à pessoa e confirme para valer.`,
        }
      }

      return {
        ...resultado,
        mensagem: resultado.gravado
          ? `Regra registrada em ${resultado.secao}. Vale a partir da próxima geração, do chat e do site.`
          : `Proposta montada, NADA foi gravado ainda. Mostre a linha à pessoa e confirme para valer.`,
      }
    },
  },

  {
    name: 'buscar-fotos',
    description:
      'Busca fotos no acervo do cliente. Traz primeiro as menos usadas, para não repetir a mesma foto toda semana — o rodízio é real: cada uso fica registrado, e `ultimoUso`/`vezesUsada` dizem quando e quantas vezes. O retorno traz `catalogacao`, que mostra quantas fotos do acervo ainda não têm descrição ou tags (elas existem, mas a busca por TEMA não as alcança — peça por pasta). O acervo é organizado em pastas por assunto (cortes, ambiente, bebidas, sobremesas...) — a resposta lista as pastas disponíveis, então se a busca por tema vier vazia, tente de novo pela pasta. Ao montar vários posts de uma vez, use pastas diferentes para variar.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        theme: { type: 'string', description: 'Tema — casa com tags, bestFor e o caminho da pasta (ex: "ambiente", "picanha", "chopp").' },
        folder: { type: 'string', description: 'Pasta exata ou prefixo (ex: "01_cortes/picanha-bovina", "02_ambiente"). Veja pastasDisponiveis no retorno.' },
        menuCategory: { type: 'string', description: 'Categoria do cardápio (ex: PRATOS_PRINCIPAIS, BEBIDAS).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags a casar.' },
        quality: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Qualidade mínima.' },
        fileName: {
          type: 'string',
          description: 'Nome do arquivo, exato ou início dele ("ambiente-f3a" acha "ambiente-f3a8693.jpg"). Use quando já souber qual foto quer.',
        },
        limit: { type: 'number', description: 'Máximo de resultados (default 20). Pode pedir mais — não há teto.' },
        offset: { type: 'number', description: 'Quantas pular, para ver o resto da lista. A ordem é estável.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return buscarNoAcervo({
        projectId,
        theme: args.theme,
        folder: args.folder,
        menuCategory: args.menuCategory,
        tags: args.tags,
        quality: args.quality,
        fileName: args.fileName,
        limit: args.limit,
        offset: args.offset,
      })
    },
  },

  {
    name: 'marcar-foto-como-usada',
    description:
      'Registra que uma foto do acervo foi PUBLICADA, para ela não voltar no topo das sugestões. Use quando a peça saiu por fora do Studio (arte montada em outro lugar, story postado na mão) — o que nasce aqui dentro já é marcado sozinho.\n\nÉ o que faz "não repetir a mesma foto na semana" funcionar: buscar-fotos ordena por menos usada, e sem esse registro uma foto que foi ao ar ontem aparece como "nunca usada".',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        driveFileIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'As fotos usadas (o driveFileId que buscar-fotos devolve). Aceita várias de uma vez.',
        },
        tema: { type: 'string', description: 'Assunto da peça, para explicar depois por que a foto foi usada.' },
        quando: { type: 'string', description: 'Data da publicação "AAAA-MM-DD". Padrão: hoje.' },
      },
      required: ['projectId', 'driveFileIds'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const ids = Array.isArray(args.driveFileIds)
        ? args.driveFileIds.filter((i: unknown): i is string => typeof i === 'string' && i.trim().length > 0)
        : []
      if (ids.length === 0) {
        throw new Error('Informe pelo menos uma foto em driveFileIds.')
      }
      // Data opcional: marcar peça já publicada precisa da data REAL, senão o
      // rodízio acha que a foto acabou de sair.
      let quandoInformado: Date | null = null
      if (typeof args.quando === 'string' && args.quando.trim()) {
        const d = new Date(`${args.quando.trim()}T12:00:00-03:00`)
        if (Number.isNaN(d.getTime())) {
          throw new Error(`Data inválida: "${args.quando}". Use o formato AAAA-MM-DD.`)
        }
        quandoInformado = d
      }
      const marcadas = await registrarUsoDeFoto({
        projectId,
        driveFileIds: ids,
        origem: 'externo',
        tema: typeof args.tema === 'string' ? args.tema : null,
        usedAt: quandoInformado,
      })
      return {
        marcadas,
        mensagem:
          marcadas > 0
            ? `Anotado: ${marcadas} foto(s) marcada(s) como usada(s). Elas vão para o fim da fila nas próximas sugestões.`
            : 'Não consegui anotar agora — o registro de uso falhou, mas nada mais foi afetado.',
      }
    },
  },

  {
    name: 'pedir-foto',
    description:
      'Gera um link de UM TOQUE para a pessoa enviar uma foto do celular direto ao estúdio. Use quando ela anexar uma foto no chat (o anexo NÃO chega até você — os bytes ficam na plataforma) ou disser que quer usar uma foto do aparelho: mande o link, peça para tocar e escolher a foto, e confira com ver-foto-enviada quando ela avisar. O link vale 30 minutos; reenviar dentro do prazo substitui a foto (mandou a errada → manda de novo, mesmo link).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente (a foto fica no acervo de envio dele).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return pedirFoto({ projectId })
    },
  },

  {
    name: 'ver-foto-enviada',
    description:
      'Confere se a foto do link de pedir-foto já chegou. Quando chegar, devolve a fotoUrl pronta para usar como imageUrl em criar-arte (arte nova) ou ajustar-arte (trocar o fundo de uma arte existente).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        uploadId: { type: 'string', description: 'O uploadId devolvido por pedir-foto.' },
      },
      required: ['projectId', 'uploadId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return verFoto({ projectId, uploadId: requireString(args, 'uploadId') })
    },
  },

  {
    name: 'listar-fotos-da-pasta',
    description:
      'Lista as fotos da pasta do cliente no Drive. Use quando o acervo ainda não foi catalogado (buscar-fotos avisa quando é o caso). O retorno traz `pastasDisponiveis` e o `total` do filtro — dá para pedir mais com `limit`.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        folder: {
          type: 'string',
          description: 'Pasta pelo NOME, exata ou prefixo ("09_ambiente" traz "09_ambiente/noite" junto). Veja pastasDisponiveis no retorno.',
        },
        limit: { type: 'number', description: 'Máximo de imagens (default 30).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return listarImagensDoDrive(
        projectId,
        typeof args.limit === 'number' ? args.limit : undefined,
        typeof args.folder === 'string' && args.folder ? args.folder : undefined,
      )
    },
  },

  {
    name: 'definir-ancora',
    description:
      'Marca uma foto REAL do cliente como âncora canônica de um tipo de cena ("ambiente", "mesa", "balcao", "chopp"…), ou remove uma âncora. As âncoras alimentam a geração de imagem (gerar-imagem): a de tipo "ambiente" é injetada AUTOMATICAMENTE em toda cena gerada quando nenhuma âncora foi escolhida — é o que impede o modelo de inventar um lugar genérico. Foto do Drive vira cópia permanente no Studio na hora.\n\nEscolha fotos que mostrem bem o que definem: para "ambiente", o salão como ele é (teto real, mobília, luz); para louça/uniforme, closes nítidos. Confirme com a pessoa antes de definir — âncora vale para todas as gerações do cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        sceneTag: {
          type: 'string',
          description: 'Tipo de cena em kebab-case (ex: "ambiente", "mesa", "chopp"). "ambiente" é a tag da injeção automática.',
        },
        driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
        url: { type: 'string', description: 'Alternativa: URL de imagem já no Studio.' },
        label: { type: 'string', description: 'Rótulo curto (ex: "salão com teto real").' },
        removerAncoraId: {
          type: 'string',
          description: 'Para REMOVER: id da âncora (de listar-ancoras). Ignora os outros campos.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      if (typeof args.removerAncoraId === 'string' && args.removerAncoraId) {
        await removerAncora(projectId, args.removerAncoraId)
        return { ok: true, mensagem: 'Âncora removida.' }
      }

      const sceneTag = requireString(args, 'sceneTag')
      const ancora = await definirAncora({
        projectId,
        sceneTag,
        driveFileId: typeof args.driveFileId === 'string' ? args.driveFileId : null,
        url: typeof args.url === 'string' ? args.url : null,
        label: typeof args.label === 'string' ? args.label : null,
      })
      return {
        ok: true,
        ancora,
        mensagem:
          ancora.sceneTag === AMBIENT_SCENE_TAG
            ? 'Âncora de ambiente definida — toda cena gerada deste cliente passa a acontecer neste lugar.'
            : `Âncora "${ancora.sceneTag}" definida. Ela entra quando for escolhida como referência na geração.`,
      }
    },
  },

  {
    name: 'listar-ancoras',
    description:
      'Lista as fotos-âncora canônicas do cliente por tipo de cena (anchor sheet). Use antes de gerar-imagem para saber o que já existe, e antes de definir-ancora para não duplicar.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const ancoras = await listarAncoras(projectId)
      return {
        total: ancoras.length,
        temAmbiente: ancoras.some((a) => a.sceneTag === AMBIENT_SCENE_TAG),
        ancoras,
        ...(ancoras.every((a) => a.sceneTag !== AMBIENT_SCENE_TAG)
          ? {
              aviso:
                'Sem âncora de tipo "ambiente": cenas geradas não têm foto real do lugar e o modelo pode inventar um ambiente genérico. Sugira definir uma com definir-ancora.',
            }
          : {}),
      }
    },
  },

  {
    name: 'marcar-como-modelo',
    description:
      'Promove uma página a MODELO do cliente (ou despromove): modelos são o que escolher-modelo encontra por tema, então uma arte que ficou boa pode virar base das próximas. As tags são o que casa o modelo com o tema pedido (ex: "happy-hour", "almoco-executivo") — sem tag, o modelo não é encontrado por tema.\n\nConfirme com a pessoa antes de marcar: modelo aparece para todos que criam arte deste cliente. Tags enviadas SUBSTITUEM as atuais.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        pageId: { type: 'string', description: 'A página a marcar (de criar-arte, ajustar-arte ou listar-modelos).' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Temas do modelo, normalizados com hífen (ex: ["happy-hour", "sexta"]). Substituem as tags atuais.',
        },
        marcar: { type: 'boolean', description: 'true (default) marca como modelo; false despromove.' },
      },
      required: ['projectId', 'pageId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      // Curadoria, não edição: o modelo passa a valer para todos que criam arte
      // deste cliente. Mesmo gate das três portas equivalentes na web.
      await assertCuradorDoProjeto(projectId, principal)
      const pageId = requireString(args, 'pageId')
      const marcar = args.marcar !== false

      const page = await db.page.findUnique({
        where: { id: pageId },
        include: { Template: { select: { projectId: true, name: true } } },
      })
      if (!page || page.Template.projectId !== projectId) {
        throw new CreativeError('PAGE_NOT_FOUND', 'Página não encontrada neste cliente.', 404)
      }

      const tags = Array.isArray(args.tags)
        ? args.tags.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
        : undefined

      const updated = await db.page.update({
        where: { id: pageId },
        data: {
          isTemplate: marcar,
          ...(tags !== undefined ? { tags } : {}),
        },
        select: { id: true, name: true, isTemplate: true, tags: true },
      })

      const tagsFinais = updated.tags ?? []
      return {
        atualizada: true,
        page: updated,
        mensagem: marcar
          ? `"${updated.name}" agora é modelo do cliente${tagsFinais.length ? ` (temas: ${tagsFinais.join(', ')})` : ''}.`
          : `"${updated.name}" deixou de ser modelo.`,
        ...(marcar && tagsFinais.length === 0
          ? {
              aviso:
                'O modelo ficou SEM tags de tema — escolher-modelo não vai encontrá-lo. Envie tags (ex: "happy-hour") para ele valer.',
            }
          : {}),
      }
    },
  },

  {
    name: 'listar-modelos',
    description:
      'Lista os modelos do cliente (as páginas que escolher-modelo consegue encontrar) com as tags de tema de cada um. Com incluirNaoMarcadas=true, lista também as páginas comuns — útil para achar uma arte boa e promovê-la com marcar-como-modelo. Clientes sem modelo nenhum dependem de criar-arte (do zero) para tudo.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        incluirNaoMarcadas: { type: 'boolean', description: 'Inclui páginas que ainda não são modelo (candidatas a promoção).' },
        limit: { type: 'number', description: 'Máximo de páginas (default 50, teto 200).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const incluirNaoMarcadas = args.incluirNaoMarcadas === true
      const take = Math.min(typeof args.limit === 'number' ? args.limit : 50, 200)

      const paginas = await db.page.findMany({
        where: {
          Template: { projectId },
          ...(incluirNaoMarcadas ? {} : { isTemplate: true }),
        },
        select: {
          id: true,
          name: true,
          isTemplate: true,
          tags: true,
          updatedAt: true,
          Template: { select: { id: true, name: true, type: true, tags: true } },
        },
        orderBy: [{ isTemplate: 'desc' }, { updatedAt: 'desc' }],
        take,
      })

      const modelos = paginas
        .filter((p) => p.isTemplate)
        .map((p) => ({
          pageId: p.id,
          nome: p.name,
          template: p.Template.name,
          formato: p.Template.type,
          temas: Array.from(new Set([...(p.tags ?? []), ...(p.Template.tags ?? [])])),
        }))
      const candidatas = incluirNaoMarcadas
        ? paginas
            .filter((p) => !p.isTemplate)
            .map((p) => ({
              pageId: p.id,
              nome: p.name,
              template: p.Template.name,
              formato: p.Template.type,
              atualizadaEm: p.updatedAt,
            }))
        : undefined

      return {
        modelos,
        countModelos: modelos.length,
        ...(candidatas ? { candidatas, countCandidatas: candidatas.length } : {}),
        ...(modelos.length === 0
          ? {
              aviso:
                'Este cliente não tem nenhum modelo marcado — criar-arte (do zero) é o único caminho. Considere promover uma arte boa com marcar-como-modelo.',
            }
          : {}),
      }
    },
  },

  {
    name: 'criar-entrada-base',
    description:
      'Cria uma entrada nova na base de conhecimento do cliente. TUDO que estiver na base vira insumo dos textos futuros — deste chat e do Claudinho — então só grave informação CONFIRMADA pela pessoa (preço, horário, política, campanha), nunca suposição sua.\n\n⏳ CAMPANHA COM DATA DE FIM → GRAVE A VALIDADE. Festival, promoção de mês, cardápio sazonal, feriado: pergunte até quando vale e mande em `validade`. É o que faz a campanha parar de aparecer nos textos e nas sugestões no dia seguinte ao fim, sem ninguém precisar lembrar de arquivar.\n\n⚠️ Tom de voz, regras da marca, estilo visual e direção fotográfica NÃO vão aqui — vão no DNA (atualizar-dna). A base é buscada por relevância e identidade cadastrada nela não chega aos geradores; a categoria TOM_DE_VOZ existe só por legado.\n\nAntes de criar, consulte a base: se já existe entrada sobre o assunto, o certo é atualizar-entrada-base, não duplicar. Mostre o texto final à pessoa e só grave com o OK dela.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        category: {
          type: 'string',
          enum: Object.values(KnowledgeCategory),
          description: 'Categoria da entrada (TOM_DE_VOZ, HORARIOS, CARDAPIO, CAMPANHAS...).',
        },
        title: { type: 'string', description: 'Título curto e específico (ex: "Promoção Costela no Bafo — agosto").' },
        content: { type: 'string', description: 'O conteúdo, em texto corrido, do jeito que deve alimentar as copies.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas opcionais para busca.' },
        validade: {
          type: 'string',
          description:
            'Último dia em que a informação vale (AAAA-MM-DD, no fuso de Brasília — o dia inteiro conta). Depois disso a entrada sai sozinha dos textos e das sugestões. Obrigatório na prática para CAMPANHAS com data de fim; omita só para informação permanente (horário, cardápio fixo, política).',
        },
      },
      required: ['projectId', 'category', 'title', 'content'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const autor = await resolverAutor(projectId, principal)
      const categoria = requireString(args, 'category') as KnowledgeCategory
      if (!Object.values(KnowledgeCategory).includes(categoria)) {
        throw new Error(`Categoria inválida. Use uma de: ${Object.values(KnowledgeCategory).join(', ')}`)
      }

      const title = requireString(args, 'title')
      const content = requireString(args, 'content')
      const expiresAt = parseValidade(args.validade) ?? null

      const entry = await criarEntradaBase({
        projectId,
        category: categoria,
        title,
        content,
        tags: Array.isArray(args.tags)
          ? args.tags.filter((t: unknown): t is string => typeof t === 'string')
          : [],
        expiresAt,
        autor,
      })

      // Aviso, NUNCA veto: há campanha permanente ("Quinta do Vinho, toda
      // quinta") e recusar a gravação deixaria a pessoa sem saída.
      const aviso = avisoValidadeAusente(categoria, expiresAt)

      return {
        criada: true,
        entradaId: entry.id,
        validade: expiresAt ? formatarValidade(expiresAt) : null,
        mensagem: expiresAt
          ? `Entrada "${entry.title}" criada em ${categoria}, valendo até ${formatarValidade(expiresAt)}. Depois disso ela sai sozinha dos textos.`
          : `Entrada "${entry.title}" criada em ${categoria}. Já vale para os próximos textos.`,
        ...(aviso ? { aviso } : {}),
      }
    },
  },

  {
    name: 'atualizar-entrada-base',
    description:
      'Atualiza uma entrada existente da base de conhecimento (o entradaId vem de consultar-base). É assim que preço, horário ou regra desatualizada se corrige — a mudança vale para TODOS os textos futuros, deste chat e do Claudinho.\n\n⏳ Campanha que ganhou ou mudou data de fim: mande `validade`. Prorrogou, é a data nova; virou permanente, mande null.\n\nFluxo obrigatório: consultar-base → mostrar à pessoa o texto ATUAL e o texto NOVO lado a lado → só gravar com o OK explícito. Campos não enviados ficam como estão.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        entradaId: { type: 'string', description: 'Id da entrada (de consultar-base).' },
        title: { type: 'string', description: 'Novo título (opcional).' },
        content: { type: 'string', description: 'Novo conteúdo completo (opcional — substitui o texto inteiro, não é acréscimo).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Novas etiquetas (opcional, substitui as atuais).' },
        category: {
          type: 'string',
          enum: Object.values(KnowledgeCategory),
          description: 'Nova categoria (opcional).',
        },
        validade: {
          type: ['string', 'null'],
          description:
            'Último dia em que a informação vale (AAAA-MM-DD, fuso de Brasília — o dia inteiro conta). null tira o prazo e a entrada volta a valer para sempre.',
        },
      },
      required: ['projectId', 'entradaId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const entradaId = requireString(args, 'entradaId')
      const autor = await resolverAutor(projectId, principal)

      const existente = await db.knowledgeBaseEntry.findUnique({ where: { id: entradaId } })
      if (!existente || existente.projectId !== projectId) {
        throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
      }
      // Entrada fora de circulação não alimenta texto nenhum: editar aqui
      // responderia "já vale para os próximos textos" mentindo, e ainda
      // recriaria vetores de um conteúdo arquivado.
      if (existente.status !== 'ACTIVE') {
        throw new CreativeError(
          'ENTRADA_INATIVA',
          `Esta entrada está ${existente.status === 'ARCHIVED' ? 'arquivada' : 'como rascunho'} e não alimenta os textos. Reative pela interface do Studio antes de editar.`,
          400,
        )
      }

      // Vazio não é "limpar": apagaria o texto E os vetores reportando sucesso,
      // sem histórico para recuperar. Para tirar de circulação, use arquivar.
      const title = typeof args.title === 'string' ? args.title.trim() || undefined : undefined
      const content = typeof args.content === 'string' ? args.content.trim() || undefined : undefined
      if (typeof args.title === 'string' && title === undefined) {
        throw new Error('O título não pode ficar vazio.')
      }
      if (typeof args.content === 'string' && content === undefined) {
        throw new Error('O conteúdo não pode ficar vazio. Para tirar a entrada de circulação, use arquivar-entrada-base.')
      }
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((t: unknown): t is string => typeof t === 'string')
        : undefined
      const category = typeof args.category === 'string' ? (args.category as KnowledgeCategory) : undefined
      if (category && !Object.values(KnowledgeCategory).includes(category)) {
        throw new Error(`Categoria inválida. Use uma de: ${Object.values(KnowledgeCategory).join(', ')}`)
      }
      // undefined = não veio no pedido; null = veio vazio de propósito e LIMPA
      // o prazo. Os dois casos precisam sobreviver até o `data` do update.
      const expiresAt = parseValidade(
        Object.prototype.hasOwnProperty.call(args, 'validade') ? args.validade : undefined,
      )
      if (
        title === undefined &&
        content === undefined &&
        tags === undefined &&
        category === undefined &&
        expiresAt === undefined
      ) {
        throw new Error('Nada para atualizar: envie title, content, tags, category ou validade.')
      }

      await db.knowledgeBaseEntry.update({
        where: { id: entradaId },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(content !== undefined ? { content } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(expiresAt !== undefined ? { expiresAt } : {}),
          updatedBy: autor,
        },
      })

      // Texto ou categoria novos exigem reindexar: os vetores carregam o texto
      // E a categoria nos metadados, e a busca filtra por eles.
      const mudouIndice =
        (content !== undefined && content !== existente.content) ||
        (title !== undefined && title !== existente.title) ||
        (category !== undefined && category !== existente.category)

      let avisoBusca: string | undefined
      if (mudouIndice) {
        try {
          await reindexEntry(entradaId, { projectId, userId: autor })
        } catch (erro) {
          // reindexEntry apaga os vetores antigos ANTES de gerar os novos: se
          // falhar aqui, a entrada some da busca até ser reindexada. O texto
          // salvo está correto, então não desfazemos — mas quem chamou precisa
          // saber, senão a falha morre no log.
          console.error('[mcp] reindexEntry falhou após atualizar a entrada:', erro)
          avisoBusca =
            'O texto foi salvo, mas a indexação da busca falhou — a entrada pode não aparecer em buscas até ser reindexada pela interface do Studio (avise a pessoa).'
        }
      }

      await invalidateProjectCache(projectId).catch((e) =>
        console.error('[mcp] invalidateProjectCache falhou:', e))

      // O aviso olha o estado FINAL da entrada, não o que veio no pedido:
      // mudar a categoria para CAMPANHAS numa entrada sem prazo também merece
      // a cutucada.
      const validadeFinal = expiresAt !== undefined ? expiresAt : existente.expiresAt
      const aviso = avisoValidadeAusente(category ?? existente.category, validadeFinal)

      return {
        atualizada: true,
        entradaId,
        // Devolve o texto anterior: é a única trilha de recuperação, já que o
        // banco não guarda versão antiga.
        textoAnterior: { title: existente.title, content: existente.content },
        validade: validadeFinal ? formatarValidade(validadeFinal) : null,
        mensagem: `Entrada "${title ?? existente.title}" atualizada. Já vale para os próximos textos.`,
        ...(avisoBusca ? { avisoBusca } : {}),
        ...(aviso ? { aviso } : {}),
      }
    },
  },

  {
    name: 'arquivar-entrada-base',
    description:
      'Arquiva uma entrada da base de conhecimento: ela sai da consulta e deixa de alimentar os textos. O registro não é apagado, mas reativar exige a interface do Studio (e uma reindexação por lá para ela voltar às buscas) — então trate como decisão de mão única. Use para campanha encerrada ou informação que não vale mais, e confirme com a pessoa antes, citando o título.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        entradaId: { type: 'string', description: 'Id da entrada (de consultar-base).' },
      },
      required: ['projectId', 'entradaId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const entradaId = requireString(args, 'entradaId')
      const autor = await resolverAutor(projectId, principal)

      const existente = await db.knowledgeBaseEntry.findUnique({ where: { id: entradaId } })
      if (!existente || existente.projectId !== projectId) {
        throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
      }
      if (existente.status === 'ARCHIVED') {
        return { arquivada: true, entradaId, mensagem: `"${existente.title}" já estava arquivada.` }
      }

      // Mesmo padrão do cron de expiração: vetores fora ANTES do status, senão
      // a busca RAG continua servindo o conteúdo arquivado.
      await deleteVectorsByEntry(entradaId, { projectId, userId: autor })
      await db.knowledgeBaseEntry.update({
        where: { id: entradaId },
        data: { status: 'ARCHIVED', updatedBy: autor },
      })
      await invalidateProjectCache(projectId).catch((e) =>
        console.error('[mcp] invalidateProjectCache falhou:', e))

      return {
        arquivada: true,
        entradaId,
        mensagem: `Entrada "${existente.title}" arquivada. Não alimenta mais os textos.`,
      }
    },
  },

  {
    name: 'ver-feedback-das-artes',
    description:
      'Mostra o que as pessoas acharam das artes deste cliente: "gostei" ou "preciso melhorar", com o comentário de quem pediu melhoria, a data e o link da arte. É o relatório para responder "as artes estão agradando?" e, principalmente, para LER os comentários — eles dizem em palavras o que precisa mudar na próxima leva (texto grande demais, foto escura, marca sumida). Sem período, traz as mais recentes. Use antes de propor uma nova leva: repetir o que já foi reprovado é o erro mais caro.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        de: { type: 'string', description: 'Data inicial ("AAAA-MM-DD" ou ISO). Opcional.' },
        ate: { type: 'string', description: 'Data final ("AAAA-MM-DD" ou ISO). Opcional.' },
        veredito: {
          type: 'string',
          enum: ['gostei', 'melhorar'],
          description: 'Filtra só os elogios ou só os pedidos de melhoria (opcional).',
        },
        limit: { type: 'number', description: 'Máximo de itens (default 50, teto 200).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      // Mesma leitura de datas de ver-agenda: dia solto é o dia INTEIRO em
      // Brasília, senão "de 10/08" começaria às 21h do dia 9.
      const de =
        typeof args.de === 'string'
          ? new Date(args.de.length === 10 ? `${args.de}T00:00:00-03:00` : args.de)
          : undefined
      const ate =
        typeof args.ate === 'string'
          ? new Date(args.ate.length === 10 ? `${args.ate}T23:59:59-03:00` : args.ate)
          : undefined

      const feedbacks = await listarFeedbacks({
        projectId,
        desde: de,
        ate,
        veredito: normalizarVeredito(args.veredito),
        limit: typeof args.limit === 'number' ? args.limit : 50,
      })

      const itens = feedbacks.map((f) => ({
        opiniao: f.veredito === 'gostei' ? 'gostei' : 'preciso melhorar',
        comentario: f.comentario,
        quando: formatarBRT(new Date(f.quando)),
        quem: f.quem,
        arte: f.arte?.resultUrl ?? null,
        generationId: f.generationId,
        ...(f.arte?.templateName ? { modelo: f.arte.templateName } : {}),
      }))

      const gostei = feedbacks.filter((f) => f.veredito === 'gostei').length
      const melhorar = feedbacks.length - gostei

      return {
        itens,
        total: itens.length,
        resumo: { gostei, precisaMelhorar: melhorar },
        ...(itens.length === 0
          ? {
              mensagem:
                'Ninguém opinou sobre as artes deste cliente ainda. O botão fica no rodapé da arte aberta, na galeria de criativos e na prévia da bancada.',
            }
          : {}),
      }
    },
  },
]

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
