import { currentUser } from '@clerk/nextjs/server'
import type { User } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

export class PermissionError extends Error {
  constructor(message: string, public status: number = 403) {
    super(message)
    this.name = 'PermissionError'
  }
}

export function isAdminUser(user: Pick<User, 'publicMetadata'> | null | undefined) {
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role
  return role === 'admin'
}

export async function requireAdminUser() {
  const user = await currentUser()
  if (!user || !isAdminUser(user)) {
    throw new PermissionError('Forbidden', 403)
  }
  return user
}

export async function requireProjectAccess(
  projectId: number,
  {
    userId,
    orgId,
    write = false,
  }: {
    userId: string
    orgId?: string | null
    write?: boolean
  },
) {
  const project = await fetchProjectWithShares(projectId)
  if (!project) {
    throw new PermissionError('Projeto não encontrado', 404)
  }

  const hasAccess = write
    ? hasProjectWriteAccess(project, { userId, orgId })
    : hasProjectReadAccess(project, { userId, orgId })

  if (!hasAccess) {
    throw new PermissionError('Não autorizado', 403)
  }

  return project
}
