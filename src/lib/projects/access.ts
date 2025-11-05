import { db } from '@/lib/db'

export type ProjectWithShares = Awaited<ReturnType<typeof fetchProjectWithShares>>

export async function fetchProjectWithShares(projectId: number) {
  return db.project.findUnique({
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
}

export function hasProjectReadAccess(
  project: Pick<ProjectWithShares, 'userId' | 'organizationProjects'> | null,
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
  if (project.userId === userId) return true
  if (!orgId) return false
  return project.organizationProjects.some(
    (share) => share.organization.clerkOrgId === orgId,
  )
}

export function hasProjectWriteAccess(
  project: Pick<ProjectWithShares, 'userId' | 'organizationProjects'> | null,
  {
    userId,
    orgId,
  }: {
    userId: string
    orgId?: string | null
  },
) {
  if (!project) return false
  if (project.userId === userId) return true
  if (!orgId) return false
  const share = project.organizationProjects.find(
    (item) => item.organization.clerkOrgId === orgId,
  )
  if (!share) return false
  // Todos os membros da organização têm permissão de edição colaborativa
  return true
}
