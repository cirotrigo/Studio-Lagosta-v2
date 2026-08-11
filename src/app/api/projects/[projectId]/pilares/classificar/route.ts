import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { classificarHistorico } from '@/lib/aprendizado/pilares-service'

export const runtime = 'nodejs'
/**
 * Uma chamada de modelo a cada 25 posts. Um cliente com 180 dias de histórico
 * e texto em 20% deles são ~5 chamadas — cabe folgado, mas o teto é o da
 * plataforma e o `limite` existe para quem quiser fatiar.
 */
export const maxDuration = 300

const bodySchema = z
  .object({
    /** Refaz tudo, inclusive o que já foi classificado nesta versão. */
    reclassificar: z.boolean().optional(),
    /** Janela em dias (padrão 180). */
    dias: z.number().int().min(1).max(400).optional(),
    /** Teto de posts nesta passada. */
    limite: z.number().int().min(1).max(2000).optional(),
  })
  .strict()
  .optional()

/**
 * Classifica o histórico publicado nos pilares APROVADOS do cliente.
 *
 * Casca fina sobre `classificarHistorico`. Idempotente por padrão: repetir a
 * chamada não reclassifica (nem recobra) o que já foi feito nesta versão do
 * classificador.
 */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const id = Number((await params).projectId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => undefined))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const corpo = parsed.data ?? {}

    const resultado = await classificarHistorico(id, {
      reclassificar: corpo.reclassificar,
      limite: corpo.limite,
      ...(corpo.dias ? { desde: new Date(Date.now() - corpo.dias * 24 * 3600_000) } : {}),
    })
    return NextResponse.json(resultado)
  } catch (error) {
    console.error('[pilares] classificação falhou', error)
    return NextResponse.json({ error: 'Erro ao classificar o histórico' }, { status: 500 })
  }
}
