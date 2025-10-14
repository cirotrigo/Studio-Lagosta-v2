import { auth } from '@clerk/nextjs/server'

export type OrganizationAuthContext = {
  clerkUserId: string
  organizationId: string | null
  organizationRole: string | null
  organizationPermissions: string[]
}

type PermissionMode = 'any' | 'all'

export class OrganizationAccessError extends Error {
  status: number

  constructor(message: string, status = 403) {
    super(message)
    this.name = 'OrganizationAccessError'
    this.status = status
  }
}

export async function getOrganizationAuthContext(): Promise<OrganizationAuthContext> {
  const { userId, orgId, orgRole, orgPermissions } = await auth()

  return {
    clerkUserId: userId ?? '',
    organizationId: orgId ?? null,
    organizationRole: orgRole ?? null,
    organizationPermissions: orgPermissions ?? [],
  }
}

interface RequireOptions {
  permissions?: string[]
  mode?: PermissionMode
  allowAdminBypass?: boolean
}

export async function requireOrganizationMembership(
  targetOrganizationId: string,
  options: RequireOptions = {}
) {
  const context = await getOrganizationAuthContext()

  if (!context.clerkUserId) {
    throw new OrganizationAccessError('Usuário não autenticado', 401)
  }

  if (!context.organizationId || context.organizationId !== targetOrganizationId) {
    throw new OrganizationAccessError(
      'Você precisa alternar para esta organização antes de continuar',
      403
    )
  }

  const isAdmin = context.organizationRole === 'org:admin'
  const allowAdminBypass = options.allowAdminBypass ?? true

  if (options.permissions && options.permissions.length > 0) {
    const required = options.permissions
    const mode = options.mode ?? 'any'
    const permissionSet = new Set(context.organizationPermissions)
    const hasPermissions =
      mode === 'all'
        ? required.every((perm) => permissionSet.has(perm))
        : required.some((perm) => permissionSet.has(perm))

    if (!hasPermissions && !(allowAdminBypass && isAdmin)) {
      throw new OrganizationAccessError('Permissões insuficientes para esta ação', 403)
    }
  }

  return context
}

export function ensureOrganizationPermission(
  context: OrganizationAuthContext,
  permission: string,
  { allowAdminBypass = true }: { allowAdminBypass?: boolean } = {}
) {
  const isAdmin = context.organizationRole === 'org:admin'
  if (allowAdminBypass && isAdmin) {
    return true
  }

  return context.organizationPermissions.includes(permission)
}
