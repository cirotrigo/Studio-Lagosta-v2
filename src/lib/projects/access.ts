import { db } from '@/lib/db'
import { ensureOrganizationExists } from '@/lib/organizations'

/**
 * DOIS ESPAÇOS DE ID (verificado nos dados de produção em 01/08/2026).
 *
 * `Project.userId` guarda o id INTERNO do User (cuid, ex.: `cmgh24zg3…`), mas
 * o `userId` que chega do `auth()` do Clerk — e o `McpOAuthToken.userId` — é o
 * clerkId (`user_3348L5…`). Comparar um com o outro NUNCA casa: o ramo de dono
 * destes checks era código morto.
 *
 * Ninguém percebeu porque os 11 projetos estão compartilhados com uma
 * organização cujo `ownerClerkId` é o mesmo usuário, e o segundo ramo do OR
 * cobria tudo. O sintoma só apareceria num projeto fora da organização, que
 * ficaria invisível para o próprio dono.
 *
 * Por isso todo projeto que passa por estes checks carrega o `ownerClerkId` já
 * resolvido, e o campo é OBRIGATÓRIO de propósito: um caminho novo que esqueça
 * de resolvê-lo quebra no typecheck, em vez de conceder ou negar acesso em
 * silêncio. Não há FK de `Project.userId` para `User`, então a resolução é uma
 * consulta à parte — daí os helpers `withProjectOwner`/`resolveOwnerClerkId`.
 */
export type ProjectOwnerIdentity = {
  /**
   * clerkId do dono, resolvido a partir de `Project.userId`.
   * `null` = projeto órfão (a coluna não bate com nenhum User).
   */
  ownerClerkId: string | null
}

export type ProjectWithShares = Awaited<ReturnType<typeof fetchProjectWithShares>>

/**
 * Traduz um `Project.userId` para o clerkId do dono. READ-ONLY: **nunca cria**
 * usuário.
 *
 * Não troque por `getUserFromClerkId`: ele CRIA o User quando não acha, e foi
 * exatamente assim que nasceram os dois Users fantasma do banco
 * (`cmgw866yc0004l404e256haon` e `cms5fv2c50000ky04fbbsd9to`), ambos com
 * `clerkId` = um cuid.
 *
 * Aceita os dois espaços porque linha antiga pode ter gravado o clerkId na
 * coluna — mesma tolerância do `resolverDono` do MCP.
 *
 * A ORDEM das duas consultas é obrigatória, e um `OR` numa consulta só está
 * ERRADO: os Users fantasma têm `clerkId` = o cuid de um usuário de verdade,
 * então `cmgh24zg3…` casa por `id` com o Ciro e por `clerkId` com o fantasma.
 * Com `findFirst({ OR })` o banco devolveu o FANTASMA, e o `ownerClerkId`
 * saía como um cuid — o ramo de dono continuava morto para os 10 projetos, e
 * quem passasse o id interno como `userId` ganhava acesso. `id` primeiro
 * porque é o que a coluna guarda hoje; clerkId é só o fallback legado.
 */
export async function resolveOwnerClerkId(projectUserId: string | null | undefined) {
  if (!projectUserId) return null

  const porId = await db.user.findUnique({
    where: { id: projectUserId },
    select: { clerkId: true },
  })
  if (porId) return porId.clerkId

  const porClerkId = await db.user.findUnique({
    where: { clerkId: projectUserId },
    select: { clerkId: true },
  })
  return porClerkId?.clerkId ?? null
}

/**
 * Valores que `Project.userId` pode ter para pertencer a este clerkId: o id
 * interno do User e — por tolerância a linhas legadas — o próprio clerkId.
 * Serve para filtrar projetos no banco, onde não dá para resolver o dono linha
 * a linha. READ-ONLY: nunca cria usuário.
 */
export async function projectOwnerIdsFor(clerkId: string): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  })
  return user ? [user.id, clerkId] : [clerkId]
}

/**
 * Anexa o `ownerClerkId` a um projeto vindo de outra consulta (relação
 * `Template.Project`, `Generation.Project`, etc.), para que ele possa passar
 * pelos checks de acesso.
 */
export async function withProjectOwner<T extends { userId: string }>(
  project: T,
): Promise<T & ProjectOwnerIdentity>
export async function withProjectOwner<T extends { userId: string }>(
  project: T | null | undefined,
): Promise<(T & ProjectOwnerIdentity) | null>
export async function withProjectOwner<T extends { userId: string }>(
  project: T | null | undefined,
): Promise<(T & ProjectOwnerIdentity) | null> {
  if (!project) return null
  return { ...project, ownerClerkId: await resolveOwnerClerkId(project.userId) }
}

/**
 * `true` quando o portador do clerkId é o dono do projeto.
 *
 * O fallback para a comparação crua só existe para projeto ÓRFÃO (nenhum User
 * bate com a coluna): mantém exatamente o comportamento anterior nesse canto,
 * de modo que a correção nunca tira acesso de ninguém — só devolve o que o
 * ramo quebrado deveria ter concedido.
 */
export function isProjectOwner(
  project: Pick<ProjectWithShares, 'userId'> & ProjectOwnerIdentity,
  userId: string,
) {
  if (project.ownerClerkId) return project.ownerClerkId === userId
  return project.userId === userId
}

export async function fetchProjectWithShares(projectId: number) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      organizationProjects: {
        include: {
          organization: {
            select: {
              clerkOrgId: true,
              name: true,
            },
          },
        },
      },
      Logo: {
        where: {
          isProjectLogo: true,
        },
        select: {
          id: true,
          fileUrl: true,
        },
        take: 1,
      },
    },
  })
  if (!project) return null
  return { ...project, ownerClerkId: await resolveOwnerClerkId(project.userId) }
}

export function hasProjectReadAccess(
  project:
    | (Pick<ProjectWithShares, 'userId' | 'organizationProjects'> & ProjectOwnerIdentity)
    | null,
  {
    userId,
    orgId,
    orgRole: _orgRole,
  }: {
    userId: string
    orgId?: string | null
    orgRole?: string | null
  },
) {
  if (!project) return false
  if (isProjectOwner(project, userId)) return true
  if (!orgId) return false
  return project.organizationProjects.some(
    (share) => share.organization.clerkOrgId === orgId,
  )
}

export function hasProjectWriteAccess(
  project:
    | (Pick<ProjectWithShares, 'userId' | 'organizationProjects'> & ProjectOwnerIdentity)
    | null,
  {
    userId,
    orgId,
  }: {
    userId: string
    orgId?: string | null
  },
) {
  if (!project) return false
  if (isProjectOwner(project, userId)) return true
  if (!orgId) return false
  const share = project.organizationProjects.find(
    (item) => item.organization.clerkOrgId === orgId,
  )
  if (!share) return false
  // Todos os membros da organização têm permissão de edição colaborativa
  return true
}

/**
 * Curator access: limits template/model editing to the project owner OR
 * a Clerk org admin of an organization the project is shared with.
 * Used by the "Modelos" management surface to prevent shared org *members*
 * from modifying curated template tags or layouts, while still letting
 * org admins curate.
 */
export function hasProjectOwnership(
  project:
    | (Pick<ProjectWithShares, 'userId' | 'organizationProjects'> & ProjectOwnerIdentity)
    | null,
  {
    userId,
    orgId,
    orgRole,
  }: {
    userId: string
    orgId?: string | null
    orgRole?: string | null
  },
) {
  if (!project) return false
  if (isProjectOwner(project, userId)) return true
  if (!orgId) return false
  // Clerk org admin role names: "org:admin" (default). Treat any role
  // containing "admin" as a curator to be tolerant of custom role naming.
  const isOrgAdmin = !!orgRole && orgRole.toLowerCase().includes('admin')
  if (!isOrgAdmin) return false
  return project.organizationProjects.some(
    (share) => share.organization.clerkOrgId === orgId,
  )
}

/**
 * Fetches a project and ensures organization is synced if user is in an org
 * This prevents access denial when webhook hasn't synced the org yet
 */
export async function fetchProjectWithAccess(
  projectId: number,
  {
    userId,
    orgId,
  }: {
    userId: string
    orgId?: string | null
  }
) {
  // Ensure organization exists in database before checking access
  if (orgId) {
    await ensureOrganizationExists(orgId)
  }

  // Fetch project with organization shares
  const project = await fetchProjectWithShares(projectId)

  if (!project) {
    return null
  }

  // Check if user has access
  const hasAccess = hasProjectReadAccess(project, { userId, orgId })

  return hasAccess ? project : null
}
