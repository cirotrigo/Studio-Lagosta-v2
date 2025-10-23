import { db } from '@/lib/db'

export type TemplateWithProject = Awaited<ReturnType<typeof fetchTemplateWithProject>>

export async function fetchTemplateWithProject(templateId: number) {
  return db.template.findUnique({
    where: { id: templateId },
    include: {
      Project: {
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
        },
      },
    },
  })
}

export function hasTemplateReadAccess(
  template: Pick<TemplateWithProject, 'createdBy' | 'Project'> | null,
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
  if (!template) return false

  // Acesso direto: criador do template
  if (template.createdBy === userId) return true

  // Acesso através do projeto: dono do projeto
  if (template.Project.userId === userId) return true

  // Acesso através de organização
  if (!orgId) return false
  return template.Project.organizationProjects.some(
    (share) => share.organization.clerkOrgId === orgId,
  )
}

export function hasTemplateWriteAccess(
  template: Pick<TemplateWithProject, 'createdBy' | 'Project'> | null,
  {
    userId,
    orgId,
  }: {
    userId: string
    orgId?: string | null
  },
) {
  if (!template) return false

  // Acesso direto: criador do template
  if (template.createdBy === userId) return true

  // Acesso através do projeto: dono do projeto
  if (template.Project.userId === userId) return true

  // Acesso através de organização
  if (!orgId) return false
  const share = template.Project.organizationProjects.find(
    (item) => item.organization.clerkOrgId === orgId,
  )
  if (!share) return false

  // Todos os membros da organização têm permissão de edição colaborativa
  return true
}
