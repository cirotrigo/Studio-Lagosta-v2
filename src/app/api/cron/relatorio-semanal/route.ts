/**
 * Cron: relatório semanal da carteira — toda segunda 08:00 BRT (11:00 UTC).
 *
 * Cobre a semana seg–dom que fechou ontem: métricas por cliente, aderência à
 * cadência padrão e sinais de aprendizado. Grava em InstagramWeeklyReport e
 * manda UM resumo no grupo do WhatsApp. Ver src/lib/relatorios/semanal.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { gerarRelatorioSemanal } from '@/lib/relatorios/semanal'

export const runtime = 'nodejs'
// Inline de propósito: o glob do vercel.json é app/api/** e o projeto é src/app/**.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Relatorio Semanal] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resultado = await gerarRelatorioSemanal({ enviarWhatsApp: true })
    console.log(
      `[Relatorio Semanal] semana ${resultado.semana}: ${resultado.clientes} clientes, ${resultado.gravados} gravados, WhatsApp ${resultado.enviado ? 'enviado' : 'NÃO enviado'}`,
    )
    return NextResponse.json({ success: true, ...resultado, mensagem: undefined })
  } catch (error) {
    console.error('[Relatorio Semanal] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
