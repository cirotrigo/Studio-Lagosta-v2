/**
 * Cron: avaliações do Google via Windsor — coleta, rascunho e aviso.
 *
 * Diário às 12:00 UTC (09:00 BRT) DE PROPÓSITO: o aviso de negativa chega
 * quando a equipe pode agir. Cron próprio (e não carona no fetch-feed-insights
 * das 07:30 UTC) exatamente por causa do horário do aviso — 04:30 BRT é
 * mensagem enterrada no grupo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cicloDiarioDeAvaliacoes } from '@/lib/avaliacoes/ciclo-diario'

export const runtime = 'nodejs'
// Inline de propósito: o glob do vercel.json é app/api/** e o projeto é
// src/app/** — declarar lá não tem efeito.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Avaliacoes Cron] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inicio = Date.now()
  try {
    const resumo = await cicloDiarioDeAvaliacoes()
    console.log('[Avaliacoes Cron] Finished:', JSON.stringify(resumo))
    return NextResponse.json({ success: true, elapsedMs: Date.now() - inicio, ...resumo })
  } catch (error) {
    console.error('[Avaliacoes Cron] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
