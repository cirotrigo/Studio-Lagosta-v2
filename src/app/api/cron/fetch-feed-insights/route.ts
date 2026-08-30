/**
 * Cron: métricas do FEED (carrossel, imagem, reel) via Graph API.
 *
 * Roda 1x por dia. Antes dele NENHUM caminho coletava métrica de feed: o cron
 * de stories filtra STORY, o de Later depende de add-on não contratado no
 * Zernio (responde 402 desde sempre), e a tabela InstagramFeed esperava um
 * webhook externo que nunca disparou. Resultado medido em 28/08/2026: zero
 * posts de feed com métrica, em todos os clientes.
 *
 * Feed não expira como story, então uma passada diária basta — os números só
 * continuam crescendo. Janela de 60 dias; o backfill profundo é
 * scripts/backfill-feed-insights.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { coletarFeedDeTodos } from '@/lib/instagram/feed-insights'
import { coletarFeedViaWindsor } from '@/lib/windsor/coleta-feed'

export const runtime = 'nodejs'
// Inline de propósito: o glob do vercel.json é app/api/** e o projeto é
// src/app/** — declarar lá não tem efeito.
export const maxDuration = 300

const ORCAMENTO_MS = 240_000 // folga para terminar a mídia em voo e responder

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Feed Insights Cron] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inicio = Date.now()
  console.log('[Feed Insights Cron] Starting feed insights fetch...')

  try {
    const resumos = await coletarFeedDeTodos({ sinceDays: 60, prazoMs: inicio + ORCAMENTO_MS })

    // Segunda fonte: clientes SEM token entram pelo Windsor (uma requisição
    // cobre todas as contas). Falha aqui não derruba a coleta por token.
    let windsor: Awaited<ReturnType<typeof coletarFeedViaWindsor>> | { erro: string } | null = null
    try {
      windsor = await coletarFeedViaWindsor({ sinceDays: 60 })
    } catch (erro) {
      windsor = { erro: erro instanceof Error ? erro.message : String(erro) }
      console.error('[Feed Insights Cron] coleta via Windsor falhou:', erro)
    }

    const totais = resumos.reduce(
      (t, r) => ({
        midias: t.midias + r.midias,
        comInsights: t.comInsights + r.comInsights,
        falhasInsights: t.falhasInsights + r.falhasInsights,
        postsCasados: t.postsCasados + r.postsCasados,
      }),
      { midias: 0, comInsights: 0, falhasInsights: 0, postsCasados: 0 },
    )
    const erros = resumos.filter((r) => r.erro)
    const interrompidos = resumos.filter((r) => r.interrompido)

    console.log('[Feed Insights Cron] Finished:', JSON.stringify({ totais, erros, interrompidos: interrompidos.map((r) => r.projectId) }))

    return NextResponse.json({
      success: true,
      elapsedMs: Date.now() - inicio,
      totais,
      porProjeto: resumos,
      windsor,
    })
  } catch (error) {
    console.error('[Feed Insights Cron] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
