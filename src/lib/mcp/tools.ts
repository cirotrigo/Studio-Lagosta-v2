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
 * Teto do lote. 12 é o tamanho de uma grade semanal com folga — e o que cabe
 * numa invocação só criando as Generations (a geração roda na fila durável).
 */
const MAX_LOTE = 12

/**
 * Tools AINDA NÃO migradas para o registro (src/lib/mcp/registro + catalogo/).
 *
 * Tool migrada SAI deste array no mesmo PR — o catálogo vence por nome na
 * porta (catalogo/integracao.ts), e deixar a cópia aqui seria uma segunda
 * fonte de verdade esperando divergir. Já migradas: listar-clientes,
 * criar-arte-de-modelo, a agenda inteira (ver-agenda, sugerir-posts,
 * colocar-na-agenda, postar-agora, aprovar-rascunhos, voltar-para-rascunho,
 * editar-post, trocar-arte-do-post, reagendar-post, cancelar-post) e o ciclo
 * do plano (propor-semana, criar-plano, ver-plano, editar-item-do-plano,
 * regenerar-item, executar-plano, listar-combinacoes-de-texto).
 */
export const MCP_TOOLS: McpTool[] = [
  {
    name: 'escolher-modelo',
    description:
      'Acha o modelo pronto do cliente que combina com um tema (e dia), devolvendo os campos de texto a preencher e a identidade da marca. Use quando o cliente tem modelo cadastrado para aquele tema; depois use criar-arte-de-modelo. Se não houver modelo, prefira criar-arte, que monta do zero.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto (preferido). Veja list-projects.' },
        projectHint: { type: 'string', description: 'Nome ou parte do nome do projeto, se não souber o id.' },
        theme: { type: 'string', description: 'Tema do criativo (ex: "happy hour", "almoço executivo", "delivery").' },
        day: { type: 'string', description: 'Dia da semana em PT para desempatar (ex: "sexta", "sabado").' },
      },
      required: ['theme'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      if (typeof args.projectId === 'number') await assertProjetoPermitido(args.projectId, principal)
      return prepareCreative({
        projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
        projectHint: typeof args.projectHint === 'string' ? args.projectHint : undefined,
        theme: requireString(args, 'theme'),
        day: typeof args.day === 'string' ? args.day : undefined,
      })
    },
  },

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
    name: 'marcar-referencia-de-estilo',
    description:
      'Marca (ou desmarca) uma arte pronta como REFERÊNCIA DE ESTILO do cliente — "gostei desta, faça as próximas parecidas". As marcadas entram num rodízio: cada nova arte recebe UMA delas como referência visual, sempre a menos usada, para as peças terem parentesco sem sair todas iguais.\n\nUse quando a pessoa elogiar uma arte ("essa ficou ótima", "quero mais assim"). Sem argumento `marcada`, marca. Chame sem `generationId` para LISTAR as referências atuais na ordem do rodízio.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        generationId: {
          type: 'string',
          description: 'A arte. Omita para apenas listar as referências atuais.',
        },
        marcada: {
          type: 'boolean',
          description: 'true marca (default), false tira das referências.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      if (!args.generationId) {
        const refs = await listarReferenciasDeEstilo(projectId)
        return {
          referencias: refs,
          total: refs.length,
          dica:
            refs.length === 0
              ? 'Nenhuma arte marcada ainda. Marque as que a pessoa aprovar — é o que dá cara própria às próximas.'
              : 'A primeira da lista é a que entra na próxima geração (rodízio: menos usada primeiro).',
        }
      }

      const marcada = args.marcada !== false
      const r = await definirReferenciaDeEstilo(String(args.generationId), marcada)
      return {
        ...r,
        mensagem: marcada
          ? 'Marcada. As próximas artes deste cliente vão se inspirar nela, em rodízio com as outras.'
          : 'Tirada das referências.',
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
    name: 'criar-arte',
    description:
      'Cria a arte do zero, sem depender de modelo cadastrado — é o caminho padrão. Escolha a foto, o formato e componha o texto: o mais seguro é usar uma das composições prontas (listar-combinacoes-de-texto) e só trocar as palavras. O logo entra sozinho e a foto recebe um sombreado para o texto não sumir. Mantenha os textos curtos: story se lê em dois segundos, e frase comprida estoura a caixa. Devolve a imagem e um link para ajustar no editor.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'story 1080x1920 (default), feed 1080x1350, quadrado 1080x1080.' },
        imageUrl: { type: 'string', description: 'URL pública da foto de fundo.' },
        driveImageId: { type: 'string', description: 'ID do arquivo no Google Drive, alternativa ao imageUrl.' },
        backgroundColor: { type: 'string', description: 'Cor de fundo quando não houver foto (ex: "#111111").' },
        overlay: { type: 'string', enum: ['nenhum', 'inferior', 'superior', 'completo'], description: 'Escurecimento sobre a foto. Default "inferior".' },
        combinationId: { type: 'string', description: 'ID da combinação tipográfica (ver list-font-combinations).' },
        textos: { type: 'object', description: 'Textos da combinação, por id ou label do elemento. Ex: {"titulo":"HAPPY HOUR","detalhes":"Todo dia até as 20h"}.', additionalProperties: { type: 'string' } },
        textosLivres: {
          type: 'array',
          description: 'Blocos posicionados por você. Alternativa à combinação.',
          items: {
            type: 'object',
            properties: {
              texto: { type: 'string', description: 'Conteúdo. \n quebra linha.' },
              x: { type: 'number', description: 'Canto esquerdo, fração da largura (0..1).' },
              y: { type: 'number', description: 'Topo, fração da altura (0..1).' },
              width: { type: 'number', description: 'Largura da caixa, fração da largura (0..1).' },
              fontSize: { type: 'number', description: 'Corpo em px na base de 1080 de largura.' },
              role: { type: 'string', enum: ['title', 'subtitle', 'body'], description: 'De qual fonte da marca herda. subtitle cai na fonte de corpo quando a marca não define uma própria.' },
              fontFamily: { type: 'string' },
              fontWeight: { type: 'string' },
              textTransform: { type: 'string', enum: ['none', 'uppercase'] },
              textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
              lineHeight: { type: 'number' },
              letterSpacing: { type: 'number' },
              color: { type: 'string' },
            },
            required: ['texto', 'x', 'y', 'width', 'fontSize'],
          },
        },
        logo: { type: 'boolean', description: 'Inclui o logo da marca (default true).' },
        name: { type: 'string', description: 'Nome da página gerada.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      await assertProjetoPermitido(requireNumber(args, 'projectId'), principal)
      return createArteLivre({
        projectId: requireNumber(args, 'projectId'),
        formato: args.formato,
        imageUrl: args.imageUrl,
        driveImageId: args.driveImageId,
        backgroundColor: args.backgroundColor,
        overlay: args.overlay,
        combinationId: args.combinationId,
        textos: args.textos,
        textosLivres: args.textosLivres,
        logo: args.logo,
        name: args.name,
      })
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
    name: 'ajustar-arte',
    description:
      'Ajusta uma arte já criada aqui: troca textos e/ou a foto na MESMA página e re-renderiza. Use depois de conferir-arte, quando algo saiu errado — texto estourando a caixa, foto ruim, erro de digitação. As chaves de slotValues são as mesmas da criação (id ou nome da camada; conferir-arte e o retorno da criação mostram os nomes).\n\nNão serve para páginas-modelo do cliente (essas se editam no editor). Se a arte já estiver em algum post da agenda, a arte do post é atualizada junto (re-render automático em alguns minutos).\n\nATENÇÃO: post agendado é enviado para publicação 5 minutos antes do horário, e a partir daí a arte dele NÃO muda mais. Se a resposta trouxer `aviso`, repita-o para a pessoa — o ajuste valeu para a página, mas aquele post vai ao ar com a arte anterior. Para trocar mesmo: voltar-para-rascunho, ajustar, e agendar de novo.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        pageId: { type: 'string', description: 'A arte a ajustar (pageId devolvido por criar-arte ou criar-arte-de-modelo).' },
        slotValues: {
          type: 'object',
          description: 'Só o que muda: chave = id ou nome da camada, valor = novo texto (string) ou {content, fileUrl}.',
          additionalProperties: true,
        },
        imageUrl: { type: 'string', description: 'Nova foto de fundo (URL pública).' },
        driveImageId: { type: 'string', description: 'Nova foto de fundo pelo id do Drive (de buscar-fotos).' },
        name: { type: 'string', description: 'Novo nome da página (opcional).' },
      },
      required: ['projectId', 'pageId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const r = await ajustarArte({
        projectId,
        pageId: requireString(args, 'pageId'),
        slotValues: (args.slotValues && typeof args.slotValues === 'object'
          ? args.slotValues
          : {}) as Record<string, unknown>,
        imageUrl: typeof args.imageUrl === 'string' ? args.imageUrl : undefined,
        driveImageId: typeof args.driveImageId === 'string' ? args.driveImageId : undefined,
        name: typeof args.name === 'string' ? args.name : undefined,
        decididoPor: await quemDecidiu(projectId, principal),
      })

      /**
       * O ajuste vale para a página, mas post já entregue ao publicador vai ao
       * ar com a arte anterior. Sem esta frase o chat responde "pronto,
       * ajustei" e a pessoa só descobre a divergência quando o post sai — que
       * é exatamente o defeito que a janela de congelamento veio corrigir.
       */
      if (r.postsCongelados && r.postsCongelados > 0) {
        const n = r.postsCongelados
        return {
          ...r,
          aviso:
            `Atenção: ${n === 1 ? '1 post desta arte já foi enviado' : `${n} posts desta arte já foram enviados`} ` +
            `para publicação e ${n === 1 ? 'vai sair' : 'vão sair'} com a arte ANTERIOR — o ajuste não ${n === 1 ? 'o' : 'os'} alcança. ` +
            `Para trocar de verdade: voltar-para-rascunho, ajustar e agendar de novo.`,
        }
      }

      return r
    },
  },

  {
    name: 'conferir-arte',
    description:
      'Mostra a arte para VOCÊ ver (miniatura na resposta) e confere por visão se os textos saíram exatamente como deveriam. Use depois de criar ou ajustar uma arte, antes de mostrá-la à pessoa — é o que pega texto cortado, sobreposto ou com erro. Informe generationId (arte da galeria) ou postId (arte atual de um post da agenda).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        generationId: { type: 'string', description: 'A arte (vem de criar-arte, criar-arte-de-modelo ou ajustar-arte).' },
        postId: { type: 'string', description: 'Alternativa: confere a arte ATUAL de um post da agenda.' },
        verificarTextos: { type: 'boolean', description: 'Roda a conferência de texto por visão (default true; só quando há textos de referência).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      let url: string | null = null
      let textRefGenerationId: string | null = null
      let pageIdRef: string | null = null

      if (typeof args.generationId === 'string' && args.generationId) {
        const gen = await db.generation.findFirst({
          where: { id: args.generationId, projectId },
          select: { id: true, resultUrl: true, fieldValues: true },
        })
        if (!gen) {
          throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
        }
        url = gen.resultUrl
        textRefGenerationId = gen.id
        const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
        pageIdRef =
          typeof fv.pageId === 'string'
            ? fv.pageId
            : fv.source === 'ajuste-arte' && typeof fv.sourcePageId === 'string'
              ? fv.sourcePageId
              : null
      } else if (typeof args.postId === 'string' && args.postId) {
        const post = await db.socialPost.findFirst({
          where: { id: args.postId, projectId },
          select: { mediaUrls: true, generationId: true, pageId: true },
        })
        if (!post) {
          throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste cliente.', 404)
        }
        url = post.mediaUrls?.[0] ?? null
        textRefGenerationId = post.generationId
        pageIdRef = post.pageId
      } else {
        throw new Error('Informe generationId ou postId.')
      }

      if (!url) {
        throw new CreativeError('SEM_IMAGEM', 'Esta arte ainda não tem imagem para conferir.', 400)
      }

      const { buffer } = await fetchImageSource(url)
      const meta = await sharp(buffer).metadata()
      const thumb = await sharp(buffer)
        .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer()

      const expected = textRefGenerationId
        ? await loadExpectedTextsForGeneration(textRefGenerationId)
        : []

      let verificacaoTexto: Record<string, unknown> | string = 'sem-referencia'
      if (args.verificarTextos !== false && expected.length > 0) {
        try {
          const check = await verifyImageTexts(buffer, expected)
          verificacaoTexto = check.passed
            ? { resultado: 'ok', textosConferidos: expected.length }
            : { resultado: 'divergente', faltando: check.missing, transcricao: check.extracted.slice(0, 20) }
        } catch (erro) {
          verificacaoTexto = `indisponivel: ${erro instanceof Error ? erro.message : String(erro)}`
        }
      }

      // Leitura que falhou + camadas sobrepostas na página = o diagnóstico
      // certo é SOBREPOSIÇÃO, não "texto faltando" — a visão não lê o que
      // está impresso um sobre o outro, e culpar o slot leva o modelo a
      // "corrigir" o lugar errado.
      if (
        typeof verificacaoTexto === 'object' &&
        verificacaoTexto.resultado === 'divergente' &&
        pageIdRef
      ) {
        try {
          const page = await db.page.findFirst({
            where: { id: pageIdRef, Template: { projectId } },
            select: { layers: true, width: true, height: true },
          })
          if (page) {
            await registerProjectFonts(projectId)
            const measureBox = await createServerTextBoxMeasurer()
            const { issues } = checkTextGeometry(
              parseLayers(page.layers),
              { width: page.width, height: page.height },
              measureBox,
            )
            const colisoes = issues.filter((i) => i.tipo === 'colisao')
            if (colisoes.length > 0) {
              verificacaoTexto = {
                resultado: 'sobreposicao',
                camadasEnvolvidas: Array.from(new Set(colisoes.flatMap((i) => i.camadas))),
                detalhe: colisoes.map((i) => i.detalhe).join('; '),
                faltando: verificacaoTexto.faltando,
              }
            }
          }
        } catch (erro) {
          console.warn('[mcp] diagnóstico geométrico do conferir-arte falhou:', erro)
        }
      }

      const resultado =
        typeof verificacaoTexto === 'object' ? (verificacaoTexto.resultado as string) : null
      const resumo = {
        url,
        largura: meta.width ?? null,
        altura: meta.height ?? null,
        verificacaoTexto,
        dica:
          resultado === 'sobreposicao'
            ? 'As camadas apontadas estão impressas uma sobre a outra — a leitura falhou por isso, não porque o texto não existe. Encurte o texto com ajustar-arte ou use outro modelo.'
            : resultado === 'divergente'
              ? 'Texto divergente: corrija com ajustar-arte antes de mostrar à pessoa.'
              : 'Olhe a miniatura: texto legível? Nada cortado ou sobreposto? Foto combina com o tema? Se algo estiver errado, use ajustar-arte.',
      }

      return {
        _mcpContent: [
          { type: 'text', text: JSON.stringify(resumo, null, 2) },
          { type: 'image', data: thumb.toString('base64'), mimeType: 'image/jpeg' },
        ],
      }
    },
  },

  {
    name: 'melhorar-arte',
    description:
      'Melhora uma arte com IA: o modelo de imagem refina a composição inteira (luz, sombra, textura, integração do texto com a foto) seguindo a direção de arte e a identidade da marca. Os textos são mantidos EXATAMENTE como estão e conferidos por visão ao final — se divergirem, a melhoria é descartada e a arte original continua valendo.\n\nNo fluxo normal a melhoria é o ACABAMENTO da criação: a arte criada é o esboço fiel (layout + textos certos) e esta etapa a leva ao nível de publicação. Antes de chamar, olhe a arte com conferir-arte e escreva o pedido a partir da SUA análise: aponte o que corrigir em concreto (hierarquia, contraste, luz da foto, integração do texto com o fundo, poluição) e o que preservar — sem falar dos textos, que são preservados automaticamente. Pedido vago ("deixe mais bonita") desperdiça a geração.\n\nDemora cerca de 2 minutos e custa créditos: a resposta volta na hora com o id da geração, acompanhe com ver-geracao. Com postId, aplica ao post da agenda ao final — vale para rascunho e agendado. Não chame de novo enquanto houver melhoria em andamento da mesma arte.\n\nPost agendado é enviado para publicação 5 minutos antes do horário e a partir daí a arte não muda mais: melhorar um post nesse estado é recusado (a melhoria leva ~2 min e não chegaria a tempo). Em ver-agenda o campo `arte` diz até quando dá — se estiver "enviada para publicação", não tente: traga o post para rascunho antes (voltar-para-rascunho) ou proponha melhorar a arte para um próximo post.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        generationId: { type: 'string', description: 'A arte a melhorar (de criar-arte, criar-arte-de-modelo, ajustar-arte ou do post).' },
        pedido: { type: 'string', description: 'Instruções de melhoria vindas da sua análise da arte (máx 1200 caracteres). Vazio = só as diretrizes do Diretor de Arte da marca.' },
        postId: { type: 'string', description: 'Post da agenda (rascunho ou agendado) que recebe a arte melhorada ao final (opcional — sem ele a melhoria fica na galeria).' },
      },
      required: ['projectId', 'generationId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const generationId = requireString(args, 'generationId')

      const gen = await db.generation.findFirst({
        where: { id: generationId, projectId },
        select: { id: true, resultUrl: true },
      })
      if (!gen) {
        throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
      }

      // O que se melhora é a arte que está NO POST — o cron pode ter
      // re-renderizado a página depois da Generation. Só URLs do nosso Blob
      // entram no pipeline; mídia de fora (CDN do Zernio, Drive) cai no
      // resultUrl da Generation.
      const postId = typeof args.postId === 'string' && args.postId ? args.postId : undefined
      let sourceImageUrl: string | undefined
      if (postId) {
        const post = await db.socialPost.findFirst({
          where: { id: postId, projectId },
          select: { mediaUrls: true },
        })
        const atual = post?.mediaUrls?.[0]
        if (atual && VERCEL_BLOB_HOST_REGEX.test(atual) && atual !== gen.resultUrl) {
          sourceImageUrl = atual
        }
      }

      const dono = await resolverDono(projectId, principal)
      const started = await startImprovement({
        generationId,
        userRequest: typeof args.pedido === 'string' ? args.pedido : '',
        applyToPostId: postId ?? null,
        sourceImageUrl: sourceImageUrl ?? null,
        actorClerkId: dono.clerkId,
        dedupeWindowMinutes: 10,
      })

      // Só ENFILEIRA (F0.3). O MCP não dispara na hora, de propósito: uma
      // invocação daqui pode carregar várias tools (batch JSON-RPC resolvido
      // com Promise.all) sob o mesmo `maxDuration = 300`.
      if (!started.reused && started.runnerArgs) {
        await enfileirarMelhoria(started.runnerArgs)
      }

      return {
        emAndamento: true,
        melhoriaId: started.jobGenerationId,
        ...(started.reused
          ? { jaEstavaEmAndamento: true }
          : {}),
        // A execução saiu da invocação e passou pela fila (F0.3): pode
        // esperar até um minuto pela varredura antes de começar.
        tempoEstimado: 'de 2 a 3 minutos',
        mensagem: started.reused
          ? 'Já havia uma melhoria desta arte em andamento — acompanhe ela com ver-geracao em vez de disparar outra.'
          : `Melhoria iniciada. Consulte ver-geracao com geracaoId=${started.jobGenerationId} em ~3 minutos${postId ? '; se o texto conferir, a arte do post é trocada sozinha' : ''}.`,
      }
    },
  },

  {
    name: 'ver-geracao',
    description:
      'Acompanha qualquer arte em andamento — a criada por gerar-imagem/criar-arte E a melhoria disparada por melhorar-arte: em andamento, pronta ou falhou. Quando pronta, traz a imagem nova e o resultado da conferência de texto; quando falha, a arte original continua valendo. Consulte ~2 minutos após disparar (e re-consulte em ~30s se ainda estiver em andamento).\n\nChamava-se `ver-melhoria`, e esse nome segue funcionando — mas ele sugeria que só servia para melhorias, o que fazia quem gerava arte nova procurar uma tool que não existe.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        geracaoId: { type: 'string', description: 'O geracaoId (ou melhoriaId) devolvido por quem disparou.' },
        melhoriaId: { type: 'string', description: 'Nome antigo de `geracaoId` — segue aceito.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const melhoriaId = requireString(args, 'melhoriaId')

      const gen = await db.generation.findFirst({
        where: { id: melhoriaId, projectId },
        select: {
          id: true,
          status: true,
          resultUrl: true,
          fieldValues: true,
          createdAt: true,
          completedAt: true,
          sourceGenerationId: true,
        },
      })
      if (!gen) {
        throw new CreativeError('MELHORIA_NAO_ENCONTRADA', 'Melhoria não encontrada neste cliente.', 404)
      }

      const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
      const galleryUrl = `${getPublicAppUrl()}/projects/${projectId}?tab=criativos`

      if (gen.status === 'PROCESSING') {
        const decorrido = Math.round((Date.now() - gen.createdAt.getTime()) / 1000)
        return {
          situacao: 'em-andamento',
          decorridoSegundos: decorrido,
          mensagem:
            decorrido > 300
              ? 'Está demorando mais que o normal — se passar de 6 minutos, considere que falhou e dispare de novo.'
              : 'Ainda gerando. Consulte de novo em ~30 segundos.',
        }
      }

      if (gen.status === 'COMPLETED') {
        const applyToPostId = typeof fv.applyToPostId === 'string' ? fv.applyToPostId : null
        let aplicadaAoPost: boolean | undefined
        let avisoPost: string | undefined
        if (applyToPostId) {
          const post = await db.socialPost.findFirst({
            where: { id: applyToPostId },
            select: { generationId: true, status: true },
          })
          aplicadaAoPost = post?.generationId === gen.id
          if (!aplicadaAoPost) {
            avisoPost =
              'A melhoria ficou pronta, mas o post não estava mais aprovado quando ela terminou — a arte nova está só na galeria.'
          }
        }
        return {
          situacao: 'pronta',
          url: gen.resultUrl,
          verificacaoTexto: fv.textCheck ?? 'skipped',
          ...(aplicadaAoPost !== undefined ? { aplicadaAoPost } : {}),
          ...(avisoPost ? { avisoPost } : {}),
          galleryUrl,
          dica: 'Use conferir-arte com este generationId para VER a arte antes de mostrá-la à pessoa.',
          generationId: gen.id,
        }
      }

      return {
        situacao: 'falhou',
        motivo: typeof fv.error === 'string' ? fv.error : 'Erro desconhecido',
        verificacaoTexto: fv.textCheck ?? undefined,
        mensagem:
          'A melhoria foi descartada e a arte original continua valendo — nada mudou no post nem na galeria. Dá para tentar de novo com um pedido mais específico.',
      }
    },
  },

  {
    name: 'gerar-imagem',
    description:
      'Gera uma imagem ou arte DO ZERO com IA, ancorada em fotos reais do cliente. Duas trilhas que nunca se misturam:\n\n- trilha "imagem": fotografia/cena SEM NENHUM texto (nem logo) — para fundo de peça, cena de ambiente, variação de foto. Requer `pedido` descrevendo a cena.\n- trilha "arte": peça PRONTA com os textos desenhados na imagem — requer `copy` (os blocos exatos, na ordem) e uma foto real como cena (referência com role "subject"). A identidade da marca (logo, paleta, fontes) entra sozinha; os textos são conferidos por visão ao final.\n\nREFERÊNCIAS (a alma da qualidade): passe 1 a 3 fotos REAIS do cliente com papel declarado — "subject" (a foto do prato/produto, obrigatória na trilha arte), "anchor-ambient" (foto do salão/ambiente: a cena acontece NESTE lugar; use SEMPRE que a cena mostrar o ambiente), "anchor-dish" (segundo ângulo do prato) e "style" (arte aprovada como referência de estilo). Há ainda "documento" (máx 1, só na trilha arte): um print/cartaz que entra na peça TAL E QUAL — colado por código DEPOIS da geração, com sombra de cartão, numa faixa central que o prompt reserva; use para print de avaliação do Google, cartaz ou QR, porque a IA redesenharia o texto se o recebesse. Poucas referências boas vencem muitas: refs demais fazem o visual derivar. Fotos vêm do acervo (buscar-fotos → driveFileId) ou de URL do Studio.\n\nMODO DIRETOR (opcional, trilha imagem): se você mesmo escrever o prompt de fotografia em inglês (anatomia CAMERA:/LENS:/LIGHT:/…, física em Kelvin/graus/IRE, sem buzzwords, até ~4000 chars, zero texto na imagem), passe em `promptPronto` — ele é usado no lugar do redator automático. A validação é AVISO, não bloqueio: prompt fora da régua gera do mesmo jeito e a ressalva fica gravada. Escreva denso, mas NÃO corte as proibições para caber — são elas que seguram a identidade da marca.\n\nCUSTO (a resposta traz `creditosCobrados`, sempre confira antes de repetir): trilha arte 25 créditos; trilha imagem 10 no modelo padrão, 15 no `nano-banana-pro` em 2K e 30 nele em 4K. Só peça 4K quando a margem para recorte for usada — ela custa o TRIPLO do padrão.\n\nDemora 1–3 minutos. A resposta volta na hora com geracaoId; acompanhe com ver-geracao. Disparos de temas DIFERENTES podem ser feitos em paralelo; o mesmo pedido repetido em 10 minutos é reaproveitado, não cobrado de novo.\n\nA trilha imagem entrega a foto na resolução NATIVA do modelo (2K ≈ 1536x2752 no 9:16; 4K ≈ 3072x5504), porque ela é insumo e vai ser recortada depois. Só a trilha arte sai no tamanho exato de publicação.\n\nANCHOR SHEET: se o cliente tem âncora de tipo "ambiente" definida (listar-ancoras), toda cena gerada na trilha imagem a recebe automaticamente quando você não passar uma âncora de ambiente — não precisa repeti-la nas referências.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        trilha: {
          type: 'string',
          enum: ['imagem', 'arte'],
          description: '"imagem" = cena sem texto; "arte" = peça com os textos desenhados.',
        },
        pedido: {
          type: 'string',
          description:
            'O que gerar, em português (máx 1200). Obrigatório na trilha imagem; na trilha arte é instrução adicional opcional.',
        },
        copy: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Trilha arte: os blocos de texto EXATOS da peça, na ordem de leitura (máx 12 blocos de 200 chars). As PALAVRAS são reproduzidas verbatim e conferidas por visão; a CAIXA das letras, não — quem decide se a manchete sai em caixa alta é a identidade da marca. Escreva em caixa natural ("Desacelere e desfrute"), deixando em maiúsculas só sigla, unidade, valor e o nome da marca.',
        },
        formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'story 9:16, feed 4:5, quadrado 1:1.' },
        referencias: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'],
                description: 'Papel da foto na geração.',
              },
              driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos / listar-fotos-da-pasta).' },
              url: { type: 'string', description: 'Alternativa: URL de imagem já no Studio (Blob).' },
              label: { type: 'string', description: 'Rótulo curto (ex: "salão principal", "picanha na tábua").' },
              generationId: {
                type: 'string',
                description:
                  'Só em role "style": o id da arte deste projeto que serve de MODELO. Com ele a peça nova copia a DIAGRAMAÇÃO daquela arte — posição do texto, alinhamento, caixa das letras, cor por nível e ornamentos —, mudando só a foto e a copy. Sem ele, a referência combina apenas clima e luz, e o layout continua livre. Use quando alguém disser "faz parecida com aquela".',
              },
              excluir: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'O que NÃO reproduzir desta foto (ex: ["garrafa de molho", "lata de refrigerante"]). Use para marca de terceiro que aparece na foto e não pode ir para a peça — dizer isso dentro do `pedido` não segura: na produção do By Rock a garrafa de Tabasco vazou em 2 de 6 peças mesmo com a instrução explícita.',
              },
            },
            required: ['role'],
            additionalProperties: false,
          },
          description: '1 a 3 fotos reais com papel declarado. Máx: 1 subject + 3 âncoras + 2 style.',
        },
        instrucaoImagem: {
          type: 'string',
          description:
            'Trilha arte, opcional: ajuste autorizado na FOTO (ex: "escurecer o fundo atrás do texto", "cortar o primeiro pedaço ao meio mostrando o ponto da carne"). Sem isso a foto é preservada intocada — a regra da casa é "a foto se melhora, nunca se modifica". Com ajuste, a peça é gerada no modelo mais caprichoso (leva ~2 min em vez de ~40s, mesmo custo em créditos): editar foto exige detalhe que o modelo rápido não entrega.',
        },
        clienteCitadoId: {
          type: 'number',
          description:
            'Trilha arte, opcional — co-branding: o ID do cliente CITADO na peça (de listar-clientes). A logomarca oficial dele é composta na arte no canto oposto ao da marca da casa. É como uma agência mostra o trabalho feito para um cliente.',
        },
        promptPronto: {
          type: 'string',
          description: 'Modo diretor (trilha imagem): prompt final em inglês, anatomia CAMERA:/LIGHT:/…; validado antes de usar.',
        },
        modelo: {
          type: 'string',
          description:
            'Override do modelo, trilha imagem. "nano-banana-2" (padrão, 10 créditos) ou "nano-banana-pro" (15 créditos em 2K, e o único que entrega 4K). Não troque sem motivo: o padrão resolve a maioria das cenas.',
        },
        resolution: {
          type: 'string',
          enum: ['2K', '4K'],
          description:
            'Trilha imagem, padrão 2K (~1536x2752 no 9:16). "4K" só existe no nano-banana-pro, entrega ~3072x5504 e custa 30 créditos — o TRIPLO do padrão. Peça 4K quando a foto for virar arte depois e precisar de margem para recorte; para uso direto, 2K basta. (1K foi removido: custava o mesmo que 2K e entregava um quarto dos pixels.)',
        },
      },
      required: ['projectId', 'trilha', 'formato'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const trilha = args.trilha === 'arte' ? ('arte' as const) : ('imagem' as const)
      const formato =
        args.formato === 'feed' ? ('feed' as const) : args.formato === 'quadrado' ? ('quadrado' as const) : ('story' as const)

      const referencias: ArtGenerationReference[] = Array.isArray(args.referencias)
        ? args.referencias
            .filter((r: unknown): r is Record<string, string> => !!r && typeof r === 'object')
            .map((r) => ({
              role: r.role as ArtGenerationReference['role'],
              driveFileId: typeof r.driveFileId === 'string' && r.driveFileId ? r.driveFileId : undefined,
              url: typeof r.url === 'string' && r.url ? r.url : undefined,
              label: typeof r.label === 'string' && r.label ? r.label.slice(0, 80) : undefined,
              // Procedência conferida no serviço: id que não é deste projeto é
              // descartado e a referência segue valendo como clima.
              generationId:
                typeof r.generationId === 'string' && r.generationId ? r.generationId : undefined,
              excluir: Array.isArray((r as Record<string, unknown>).excluir)
                ? ((r as unknown as { excluir: unknown[] }).excluir
                    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
                    .slice(0, 6)
                    .map((e) => e.slice(0, 60)))
                : undefined,
            }))
        : []

      const dono = await resolverDono(projectId, principal)
      const started = await startArtGeneration({
        projectId,
        track: trilha,
        pedido: typeof args.pedido === 'string' ? args.pedido : undefined,
        copy: Array.isArray(args.copy)
          ? args.copy.filter((b: unknown): b is string => typeof b === 'string')
          : undefined,
        formato,
        referencias,
        instrucaoImagem: typeof args.instrucaoImagem === 'string' ? args.instrucaoImagem : null,
        marcaDoClienteProjectId:
          typeof args.clienteCitadoId === 'number' && args.clienteCitadoId > 0 ? args.clienteCitadoId : null,
        modelo: typeof args.modelo === 'string' && args.modelo ? args.modelo : undefined,
        resolution:
          args.resolution === '1K' || args.resolution === '2K' || args.resolution === '4K'
            ? args.resolution
            : undefined,
        finalPrompt: typeof args.promptPronto === 'string' && args.promptPronto ? args.promptPronto : null,
        actorClerkId: dono.clerkId,
        dedupeWindowMinutes: 10,
      })

      // Enfileira e responde — ver a nota em melhorar-arte.
      if (!started.reused && started.runnerArgs) {
        await enfileirarArte(started.runnerArgs)
      }

      return {
        emAndamento: true,
        geracaoId: started.jobGenerationId,
        ...(started.reused ? { jaEstavaEmAndamento: true } : {}),
        // O preço DESTA chamada. Sem ele, quem escolhe modelo e resolução
        // escolhe às cegas — e 4K no pro custa o triplo do padrão.
        creditosCobrados: started.creditosCobrados,
        tempoEstimado: trilha === 'arte' ? 'de 2 a 3 minutos' : 'de 1 a 2 minutos',
        mensagem: started.reused
          ? 'Já havia uma geração idêntica em andamento — acompanhe ela com ver-geracao em vez de disparar outra. Nada foi cobrado nesta chamada.'
          : `Geração iniciada (${started.creditosCobrados} créditos). Acompanhe com ver-geracao (geracaoId=${started.jobGenerationId}); quando pronta, use conferir-arte para VER o resultado antes de mostrar à pessoa.`,
      }
    },
  },

  {
    name: 'gerar-imagem-lote',
    description:
      'Gera VÁRIAS cenas de uma vez, com uma base comum e uma lista de variações — o formato natural de uma grade semanal.\n\nExiste porque doze peças eram doze chamadas repetindo o mesmo prompt de ~1.400 caracteres, mudando só gesto e cenário: caro na conversa e, pior, aberto a divergência entre peças que deveriam ser irmãs. Aqui a base é escrita UMA vez e vale para todas.\n\nCada variação vira uma geração independente, com seu próprio geracaoId — acompanhe com ver-geracao. O `loteId` fica gravado em todas, para reencontrá-las juntas depois.\n\nCUSTO: some o de cada uma. A resposta traz `creditosCobrados` no total e por item; confira ANTES de repetir o lote. Máximo de 12 por chamada.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        trilha: { type: 'string', enum: ['imagem', 'arte'], description: 'Vale para o lote inteiro.' },
        formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'Vale para o lote inteiro.' },
        modelo: { type: 'string', description: 'Override do modelo (trilha imagem).' },
        resolution: { type: 'string', enum: ['2K', '4K'], description: 'Trilha imagem, padrão 2K.' },
        pedidoBase: {
          type: 'string',
          description: 'O que TODAS as cenas têm em comum (máx 1200). Cada variação acrescenta o que muda.',
        },
        referenciasBase: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'] },
              driveFileId: { type: 'string' },
              url: { type: 'string' },
              label: { type: 'string' },
              excluir: { type: 'array', items: { type: 'string' } },
            },
            required: ['role'],
            additionalProperties: false,
          },
          description: 'Referências que valem para todas. A variação pode ACRESCENTAR as suas.',
        },
        variacoes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pedido: { type: 'string', description: 'O que muda nesta peça (gesto, cenário, prato).' },
              promptPronto: { type: 'string', description: 'Modo diretor, só desta peça.' },
              copy: { type: 'array', items: { type: 'string' }, description: 'Trilha arte: os blocos desta peça.' },
              referencias: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style', 'documento'] },
                    driveFileId: { type: 'string' },
                    url: { type: 'string' },
                    label: { type: 'string' },
                    excluir: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['role'],
                  additionalProperties: false,
                },
              },
              instrucaoImagem: { type: 'string', description: 'Ajuste autorizado na foto, só desta peça.' },
            },
            additionalProperties: false,
          },
          description: 'De 2 a 12 peças. Cada uma herda a base e acrescenta o que é seu.',
        },
      },
      required: ['projectId', 'trilha', 'formato', 'variacoes'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const variacoes = Array.isArray(args.variacoes) ? args.variacoes : []
      if (variacoes.length < 2) {
        throw new Error('Um lote tem pelo menos 2 variações — para uma peça só, use gerar-imagem.')
      }
      if (variacoes.length > MAX_LOTE) {
        throw new Error(`No máximo ${MAX_LOTE} peças por lote (pedidas ${variacoes.length}).`)
      }

      const trilha = args.trilha === 'arte' ? ('arte' as const) : ('imagem' as const)
      const formato =
        args.formato === 'feed' ? ('feed' as const) : args.formato === 'quadrado' ? ('quadrado' as const) : ('story' as const)
      const dono = await resolverDono(projectId, principal)
      const loteId = randomUUID()
      const lerRefs = (v: unknown): ArtGenerationReference[] =>
        Array.isArray(v)
          ? v
              .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
              .map((r) => ({
                role: r.role as ArtGenerationReference['role'],
                driveFileId: typeof r.driveFileId === 'string' && r.driveFileId ? r.driveFileId : undefined,
                url: typeof r.url === 'string' && r.url ? r.url : undefined,
                label: typeof r.label === 'string' ? r.label.slice(0, 80) : undefined,
                excluir: Array.isArray(r.excluir)
                  ? (r.excluir as unknown[])
                      .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
                      .slice(0, 6)
                      .map((e) => e.slice(0, 60))
                  : undefined,
              }))
          : []
      const refsBase = lerRefs(args.referenciasBase)

      /**
       * SEQUENCIAL, não `Promise.all`. Cada item valida créditos e cria a
       * Generation; disparar doze em paralelo faria doze validações lerem o
       * mesmo saldo antes de qualquer dedução — e o lote inteiro passaria com
       * saldo para uma peça só. Em série, o item N já enxerga o consumo dos
       * anteriores. São escritas rápidas; a GERAÇÃO é que roda na fila.
       */
      const itens: Array<Record<string, unknown>> = []
      let creditosTotais = 0
      for (const [i, bruta] of variacoes.entries()) {
        const v = (bruta ?? {}) as Record<string, unknown>
        const pedidoDaPeca = [
          typeof args.pedidoBase === 'string' ? args.pedidoBase.trim() : '',
          typeof v.pedido === 'string' ? v.pedido.trim() : '',
        ]
          .filter(Boolean)
          .join(' ')
        try {
          const started = await startArtGeneration({
            projectId,
            track: trilha,
            pedido: pedidoDaPeca || undefined,
            copy: Array.isArray(v.copy) ? v.copy.filter((b): b is string => typeof b === 'string') : undefined,
            formato,
            referencias: [...refsBase, ...lerRefs(v.referencias)],
            instrucaoImagem: typeof v.instrucaoImagem === 'string' ? v.instrucaoImagem : null,
            modelo: typeof args.modelo === 'string' && args.modelo ? args.modelo : undefined,
            resolution: args.resolution === '2K' || args.resolution === '4K' ? args.resolution : undefined,
            finalPrompt: typeof v.promptPronto === 'string' && v.promptPronto ? v.promptPronto : null,
            loteId,
            actorClerkId: dono.clerkId,
            dedupeWindowMinutes: 10,
          })
          if (!started.reused && started.runnerArgs) await enfileirarArte(started.runnerArgs)
          creditosTotais += started.creditosCobrados
          itens.push({
            posicao: i + 1,
            geracaoId: started.jobGenerationId,
            creditosCobrados: started.creditosCobrados,
            ...(started.reused ? { jaEstavaEmAndamento: true } : {}),
          })
        } catch (erro) {
          // Uma peça inválida não derruba o lote — o resto segue e o relato diz
          // o que ficou de fora, como em `upload-creative`.
          itens.push({ posicao: i + 1, erro: erro instanceof Error ? erro.message : String(erro) })
        }
      }

      const geradas = itens.filter((i) => !i.erro).length
      return {
        loteId,
        emAndamento: geradas > 0,
        creditosCobrados: creditosTotais,
        itens,
        tempoEstimado: trilha === 'arte' ? 'de 2 a 4 minutos' : 'de 1 a 3 minutos',
        mensagem:
          `${geradas} de ${variacoes.length} peça(s) na fila (${creditosTotais} créditos no total). ` +
          'Acompanhe cada uma com ver-geracao pelo geracaoId.' +
          (geradas < variacoes.length ? ' Veja `itens` para o que não entrou.' : ''),
      }
    },
  },

  {
    name: 'criar-carrossel',
    description:
      'Cria um CARROSSEL de Instagram (3 a 8 slides) com visual coerente entre os slides. Funciona em DUAS etapas, e a etapa do meio é a pessoa:\n\n1. Esta tool gera a CAPA (foto pura, SEM texto — é o que faz a série abrir pela imagem) e o SLIDE 2, que é o GUIA: ele define a diagramação, as cores e o tratamento de toda a série.\n2. Você mostra o guia à pessoa (conferir-arte). Aprovado, chame confirmar-estilo-carrossel; os demais slides são gerados copiando o look dele, em paralelo.\n\nNunca pule a confirmação: gerar seis slides no estilo errado custa seis vezes mais que perguntar.\n\nA capa NÃO leva copy (é recusada). Cada slide a partir do 2 precisa de copy e de uma foto real do acervo. Cada slide custa créditos; esta chamada gera 2.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ordem: { type: 'number', description: 'Posição no carrossel, de 1 a N. 1 = capa.' },
              copy: {
                type: 'array',
                items: { type: 'string' },
                description: 'Blocos de texto do slide, na ordem de leitura. VAZIO na capa.',
              },
              driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
              url: { type: 'string', description: 'Alternativa: imagem já no Studio.' },
              label: { type: 'string', description: 'Rótulo curto da foto.' },
            },
            required: ['ordem', 'copy'],
            additionalProperties: false,
          },
          description: 'Os slides, de 1 a N. Varie as fotos: repetir a mesma foto entre slides deixa o carrossel monótono.',
        },
        legenda: { type: 'string', description: 'Legenda do post no feed (guardada para o agendamento).' },
        pedido: { type: 'string', description: 'Direção de arte adicional para toda a série (opcional).' },
      },
      required: ['projectId', 'slides'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const slidesIn = Array.isArray(args.slides) ? args.slides : []
      const slides: SlideSpec[] = slidesIn.map((s: Record<string, unknown>) => ({
        ordem: Number(s.ordem),
        copy: Array.isArray(s.copy) ? s.copy.filter((c: unknown): c is string => typeof c === 'string') : [],
        driveFileId: typeof s.driveFileId === 'string' ? s.driveFileId : undefined,
        url: typeof s.url === 'string' ? s.url : undefined,
        label: typeof s.label === 'string' ? s.label : undefined,
      }))

      const dono = await resolverDono(projectId, principal)
      const r = await iniciarCarrossel({
        projectId,
        slides,
        legenda: typeof args.legenda === 'string' ? args.legenda : undefined,
        pedido: typeof args.pedido === 'string' ? args.pedido : undefined,
        actorClerkId: dono.clerkId,
      })
      // Duas gerações numa invocação era metade do problema que a fila resolve.
      for (const runnerArgs of r.runnerArgs) {
        await enfileirarArte(runnerArgs)
      }

      return {
        carrosselId: r.carrosselId,
        totalSlides: r.totalSlides,
        gerando: ['capa (slide 1)', 'guia (slide 2)'],
        tempoEstimado: 'cerca de 2 a 3 minutos',
        mensagem: `Capa e guia em produção. Em ~3 minutos, veja o slide 2 com conferir-arte (generationId ${r.guiaGenerationId}) e mostre à pessoa: é ele que define o visual dos outros ${r.totalSlides - 2} slides. Com o OK, chame confirmar-estilo-carrossel com carrosselId=${r.carrosselId}.`,
        guiaGenerationId: r.guiaGenerationId,
        capaGenerationId: r.capaGenerationId,
      }
    },
  },

  {
    name: 'confirmar-estilo-carrossel',
    description:
      'Depois que a pessoa aprovou o slide-guia, gera os slides restantes copiando o visual dele — posição do texto, cores, elementos gráficos e tratamento da foto. Os slides saem em paralelo (1 a 3 minutos no total, não por slide).\n\nSó chame com aprovação explícita de quem responde pelo cliente. Se o guia não agradou, NÃO confirme: crie o carrossel de novo com outra direção, ou ajuste o guia com ajustar-arte antes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        carrosselId: { type: 'string', description: 'O carrosselId devolvido por criar-carrossel.' },
      },
      required: ['projectId', 'carrosselId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const carrosselId = requireString(args, 'carrosselId')
      const dono = await resolverDono(projectId, principal)

      const r = await confirmarEstiloCarrossel({ projectId, carrosselId, actorClerkId: dono.clerkId })
      // Até 6 slides. Era o pior caso do teto compartilhado: seis `after()`
      // dividindo os mesmos 300s. Agora todos entram na fila e saem de lá.
      for (const runnerArgs of r.runnerArgs) {
        await enfileirarArte(runnerArgs)
      }

      return {
        gerando: r.gerados.map((g) => `slide ${g.ordem}`),
        tempoEstimado: 'cerca de 2 a 3 minutos (os slides saem em paralelo)',
        mensagem: `Gerando ${r.gerados.length} slide(s) com o look do guia. Acompanhe com ver-carrossel; quando todos estiverem prontos, agende com colocar-na-agenda usando as mídias na ordem.`,
      }
    },
  },

  {
    name: 'ver-carrossel',
    description:
      'Situação de um carrossel: quais slides já ficaram prontos, qual está gerando e se a série espera a confirmação do estilo. Quando completo, devolve as imagens NA ORDEM, prontas para colocar-na-agenda.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        carrosselId: { type: 'string', description: 'O carrosselId devolvido por criar-carrossel.' },
      },
      required: ['projectId', 'carrosselId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const estado = await verCarrossel(projectId, requireString(args, 'carrosselId'))
      return {
        ...estado,
        dica: estado.esperandoConfirmacao
          ? 'O guia está pronto: mostre-o à pessoa e, com o OK, chame confirmar-estilo-carrossel.'
          : estado.midiasEmOrdem
            ? 'Série completa. Agende com colocar-na-agenda passando estas imagens na ordem e o tipo CARROSSEL.'
            : 'Ainda gerando — consulte de novo em ~1 minuto.',
      }
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
