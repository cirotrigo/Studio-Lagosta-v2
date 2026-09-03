/**
 * Helpers de acesso e identidade das superfícies MCP.
 *
 * As TOOLS moram em src/lib/mcp/catalogo/ (declaração única, servida pelo
 * conector remoto e pelo stdio local); a porta que as executa mora em
 * src/lib/mcp/registro/porta.ts. O que fica aqui é o que toda tool consome:
 * quem enxerga o quê (projetosVisiveis, assertProjetoPermitido,
 * assertCuradorDoProjeto), quem assina o quê (resolverDono, resolverAutor,
 * quemDecidiu) e os tradutores do plano para a conversa (resolverPlano,
 * itemParaChat).
 *
 * Os handlers do catálogo alcançam este módulo por `await import()` — ele
 * puxa db e Clerk, e o catálogo precisa carregar sem env (ver o cabeçalho de
 * catalogo/clientes.ts).
 */

import type { CanalDaArte } from '@/lib/creatives/canal'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import type { McpPrincipal } from '@/lib/mcp/oauth'
import { formatarBRT } from '@/lib/posts/agenda-acoes'
import { lerPlano, planoAtivo } from '@/lib/planos/plano-service'
import {
  ROTULO_DO_STATUS,
  normalizarStatusDoItem,
  rotuloDaVia,
  type ViaDoItem,
} from '@/lib/planos/vocabulario'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { projectOwnerIdsFor } from '@/lib/projects/access'

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

/**
 * Por qual CANAL a tool está sendo chamada — vira `Generation.canal`.
 *
 * O handler recebe só o principal (não a superfície), então o servidor local
 * se declara no `clientId` do principal de serviço (`claude-code-local`).
 * Token OAuth é uma pessoa conversando no claude.ai; segredo de serviço sem
 * esse marcador é o Claudinho.
 */
export function canalDoPrincipal(principal: McpPrincipal): CanalDaArte {
  if (principal.kind === 'user') return 'claude-ai'
  if (principal.clientId === CLIENT_ID_LOCAL) return 'claude-code'
  return 'claudinho'
}

/** O marcador que o servidor stdio põe no principal de serviço. */
export const CLIENT_ID_LOCAL = 'claude-code-local'

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

