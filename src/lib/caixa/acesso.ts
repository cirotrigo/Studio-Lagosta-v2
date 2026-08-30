/**
 * Visibilidade da Caixa: os projetos que o usuário logado enxerga — os que
 * possui (id INTERNO do User, nunca o clerkId — lei da casa) e os
 * compartilhados com a organização ativa da sessão. Só LEITURA de User:
 * criar linha aqui é como nascem os Users fantasma.
 */
import { db } from '@/lib/db'

export interface ProjetoVisivel {
  id: number
  name: string
  instagramUsername: string | null
  temToken: boolean
}

export async function projetosVisiveisDaSessao(
  clerkUserId: string,
  orgId: string | null | undefined,
): Promise<ProjetoVisivel[]> {
  const dbUser = await db.user.findUnique({ where: { clerkId: clerkUserId }, select: { id: true } })
  const projetos = await db.project.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        ...(dbUser ? [{ userId: dbUser.id }] : []),
        ...(orgId
          ? [{ organizationProjects: { some: { organization: { clerkOrgId: orgId } } } }]
          : []),
      ],
    },
    select: { id: true, name: true, instagramUsername: true, instagramAccessToken: true },
    orderBy: { name: 'asc' },
  })
  return projetos.map((p) => ({
    id: p.id,
    name: p.name,
    instagramUsername: p.instagramUsername,
    temToken: !!p.instagramAccessToken,
  }))
}
