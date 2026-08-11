import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { classificarHistorico } from '@/lib/aprendizado/pilares-service'
import { LIMITE_DA_UI, ORCAMENTO_DA_RODADA_MS } from '@/lib/aprendizado/rodada-de-pilares'

export const runtime = 'nodejs'
/**
 * 🔴 Uma chamada de modelo a cada 25 posts, ~22s cada (medido no By Rock em
 * 11/08/2026). Isto NÃO cabia: 509 posts = 21 lotes = 460s contra os 300s
 * daqui, e como cada lote grava ao terminar, a pessoa via um erro sem saber que
 * havia progredido — e clicar de novo recomeçava do mesmo lugar.
 *
 * Hoje a passada tem teto (`LIMITE_DA_UI`) e relógio (`ORCAMENTO_DA_RODADA_MS`),
 * e devolve `restantes` para a tela poder dizer "faltam M, clique de novo".
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
  const inicio = Date.now()
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
      // Teto padrão: quem chama de fora pode pedir mais, mas o relógio abaixo
      // continua valendo — ele é o que garante uma resposta dentro dos 300s.
      limite: corpo.limite ?? LIMITE_DA_UI,
      prazoEm: inicio + ORCAMENTO_DA_RODADA_MS,
      ...(corpo.dias ? { desde: new Date(Date.now() - corpo.dias * 24 * 3600_000) } : {}),
    })
    return NextResponse.json(resultado)
  } catch (error) {
    console.error('[pilares] classificação falhou', error)
    return NextResponse.json({ error: 'Erro ao classificar o histórico' }, { status: 500 })
  }
}
