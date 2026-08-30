import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectOwnership,
  hasProjectReadAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

const bodySchema = z.object({
  driveFileId: z.string().trim().min(1, 'driveFileId é obrigatório'),
  destaque: z.boolean(),
})

/**
 * Curadoria "prata da casa" (F1.4 do plano de sugestão de fotos): promove ou
 * despromove uma foto do acervo a DESTAQUE. Espelho do padrão dos modelos —
 * foto nasce acervo; destaque é promoção deliberada — e por isso o gate é o
 * MESMO das rotas de modelos (`hasProjectOwnership`): enxergar o cliente não
 * é mandar na curadoria dele.
 *
 * - `destaque: true` → upsert por (projectId, driveFileId). Re-promover só
 *   LIMPA `revogadoEm`; a linha original (origem, quem decidiu, quando) é o
 *   registro e não é reescrita.
 * - `destaque: false` → grava `revogadoEm` (despromover, NUNCA delete —
 *   mesmo princípio da curadoria de modelos). Linha inexistente responde ok
 *   sem criar nada.
 * - `decididoPor` é o User.id INTERNO, resolvido por LEITURA (`findUnique`
 *   por clerkId, sem criar — criar User em código de auditoria é como nascem
 *   os Users fantasma). Não achar vira null: é auditoria, não gate.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (!hasProjectOwnership(project, { userId, orgId, orgRole })) {
    return NextResponse.json(
      {
        error:
          'Apenas o curador (dono do projeto ou admin da org compartilhada) pode marcar destaques.',
      },
      { status: 403 },
    )
  }

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { driveFileId, destaque } = parsed.data

  if (destaque) {
    // Somente LEITURA — nunca criar User aqui (auditoria, não gate).
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    })
    await db.photoDestaque.upsert({
      where: {
        projectId_driveFileId: { projectId: projectIdNum, driveFileId },
      },
      create: {
        projectId: projectIdNum,
        driveFileId,
        origem: 'humano',
        decididoPor: user?.id ?? null,
      },
      update: { revogadoEm: null },
    })
  } else {
    // Despromover, nunca excluir. `updateMany` não reclama de linha
    // inexistente — despromover o que nunca foi destaque é um ok vazio.
    await db.photoDestaque.updateMany({
      where: { projectId: projectIdNum, driveFileId },
      data: { revogadoEm: new Date() },
    })
  }

  return NextResponse.json({ ok: true, destaque })
}
