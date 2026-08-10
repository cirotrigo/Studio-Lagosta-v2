import { NextRequest, NextResponse } from 'next/server'
import { processarLoteDaFila } from '@/lib/ai/generation-queue-executor'

export const runtime = 'nodejs'
/**
 * ⚠️ INLINE, nunca no `vercel.json`: o glob de lá é `app/api/**` e este projeto
 * é `src/app/**` — nenhuma entrada casa (CLAUDE.md § maxDuration). 300s é o
 * mesmo teto das rotas que disparavam a geração; uma arte chega a ~290s.
 */
export const maxDuration = 300

/**
 * Varredura da fila de geração de arte por IA (F0.3), de minuto em minuto.
 *
 * Faz duas coisas, nesta ordem:
 *  1. recupera o que se perdeu — job cuja invocação morreu (arrendamento
 *     vencido) e Generation em PROCESSING sem execução nenhuma por trás,
 *     inclusive as órfãs anteriores a esta fila;
 *  2. executa o lote pendente.
 *
 * Os portões de tentativa vivem na QUERY da fila (`proximosJobs`), como manda
 * a regra do `renderPostArt` — não aqui.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const r = await processarLoteDaFila()

    if (r.reservados > 0 || r.recuperados.falhados > 0 || r.recuperados.orfasSemJob > 0) {
      console.log(
        `[cron generation-jobs] ${r.concluidos} pronta(s), ${r.falhados} falha(s), ${r.reenfileirados} de volta à fila` +
          ` | recuperação: ${r.recuperados.reenfileirados} reenfileirado(s), ${r.recuperados.falhados} sem tentativa, ${r.recuperados.orfasSemJob} órfã(s) sem job`,
      )
    }

    return NextResponse.json({ success: true, ...r })
  } catch (error) {
    console.error('[cron generation-jobs] Erro:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
