import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { executarPlano } from '@/lib/planos/executar-plano'
import { planoAtivo, MAX_ITENS_POR_PLANO } from '@/lib/planos/plano-service'
import { dispararJobAgora, LOTE_POR_VARREDURA } from '@/lib/ai/generation-queue-executor'

export const runtime = 'nodejs'
/**
 * ⚠️ INLINE, como manda a casa (o glob do `vercel.json` não alcança
 * `src/app/api`). 300 porque a via `template` renderiza NESTA invocação — o
 * serviço trabalha com orçamento de 210s e devolve `faltaram` quando corta.
 */
export const maxDuration = 300

/**
 * POST /api/projects/[projectId]/executar-plano
 *
 * O ÚNICO ponto do plano que gasta — e o gate de crédito é MECÂNICO, replicado
 * da tool `executar-plano` do MCP:
 *
 * 1. Sem `confirmar`, NADA é escrito: a resposta é a conta
 *    (`confirmacaoNecessaria: true`) para alguém ler antes de dizer sim.
 * 2. Só `confirmar: true` — o literal, qualquer outro valor NÃO confirma —
 *    produz: itens de IA entram na fila durável (F0.3), itens de modelo são
 *    renderizados aqui, em sequência.
 *
 * Regra F0.3 das rotas HTTP: enfileirar E disparar. `executarPlano` só
 * enfileira (é o contrato do MCP, que divide a invocação com outras tools);
 * o disparo imediato é responsabilidade desta rota, no `after()` abaixo.
 */

const bodySchema = z.object({
  /** A leva. Sem isto, a que está em aberto (a mais recente ativa). */
  planoId: z.string().min(1).max(64).optional(),
  /** Subconjunto da leva. Sem isto, todos os itens executáveis. */
  itemIds: z.array(z.string().min(1).max(64)).max(MAX_ITENS_POR_PLANO).optional(),
  confirmar: z.boolean().optional(),
})

/**
 * Só dispara na hora quando o handler foi RÁPIDO. Se os renders de modelo
 * comeram o orçamento, o que sobra dos 300s não comporta uma geração inteira
 * (~2 min típicos) — morrer no meio queimaria uma tentativa do job
 * (`maxAttempts` é 2) e ainda atrasaria 10 min de arrendamento. Nesse caso o
 * cron da fila pega tudo em no máximo um minuto, que é mais barato.
 */
const FOLGA_MINIMA_PARA_DISPARO_MS = 60_000

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const inicio = Date.now()
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const projectId = Number((await params).projectId)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Sem `planoId`, a leva em aberto — mesmo comportamento do MCP.
    let planoId = parsed.data.planoId?.trim()
    if (!planoId) {
      const ativo = await planoAtivo(projectId)
      if (!ativo) {
        return NextResponse.json(
          { error: 'Este cliente não tem nenhuma leva em aberto.', code: 'SEM_PLANO_ATIVO' },
          { status: 404 },
        )
      }
      planoId = ativo.id
    }

    /**
     * 🔴 Somente LEITURA: `getUserFromClerkId`/`getUserCredits` CRIAM o User
     * quando ele não existe, e é assim que nascem os Users fantasma deste
     * banco. Sem linha, o saldo fica desconhecido (a conta informa `null` em
     * vez de inventar) e a auditoria fica nula — os dois são o contrato.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const confirmar = parsed.data.confirmar === true
    const resultado = await executarPlano({
      projectId,
      planoId,
      itemIds: parsed.data.itemIds,
      confirmar,
      actorClerkId: userId,
      donoUserId: dbUser?.id ?? null,
      decididoPor: dbUser?.id ?? null,
    })

    /**
     * Disparo imediato dos jobs de IA enfileirados NESTA chamada (regra F0.3
     * das rotas HTTP). Limitado a `LOTE_POR_VARREDURA` e só com folga de tempo
     * — o resto sai pelo cron `generation-jobs` em até um minuto, e o job já
     * está no banco de qualquer forma: se este `after()` morrer, a varredura
     * recupera. O filtro por PENDING deixa de fora geração reaproveitada pelo
     * dedupe (o job dela pode estar rodando em outra invocação).
     */
    if (confirmar) {
      const geracoes = resultado.executados
        .filter((e) => e.via === 'ia' && e.generationId)
        .map((e) => e.generationId as string)
      const decorrido = Date.now() - inicio
      if (geracoes.length > 0 && decorrido < FOLGA_MINIMA_PARA_DISPARO_MS) {
        after(async () => {
          try {
            const jobs = await db.generationJob.findMany({
              where: { generationId: { in: geracoes }, status: 'PENDING' },
              select: { id: true },
              take: LOTE_POR_VARREDURA,
            })
            await Promise.all(
              jobs.map((job) =>
                dispararJobAgora(job.id).catch((erro) => {
                  console.error(`[executar-plano] disparo imediato do job ${job.id} falhou (o cron pega):`, erro)
                }),
              ),
            )
          } catch (erro) {
            console.error('[executar-plano] disparo imediato falhou (o cron pega):', erro)
          }
        })
      }
    }

    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[executar-plano] POST falhou', error)
    return NextResponse.json({ error: 'Erro ao produzir a leva' }, { status: 500 })
  }
}
