/**
 * Cron: relatório semanal da carteira — todo DOMINGO 20:00 BRT (23:00 UTC).
 *
 * Cobre a semana seg–dom que está fechando (o serviço coleta as métricas da
 * semana na hora, porque o feed de domingo ainda não passou pela coleta
 * diária): métricas por cliente, aderência à cadência padrão e sinais de
 * aprendizado. Grava em InstagramWeeklyReport e manda UM resumo no grupo do
 * WhatsApp. Ver src/lib/relatorios/semanal.ts.
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

  const url = new URL(req.url)
  // Sonda sem efeito: confirma qual versão está no ar antes de um disparo manual.
  if (url.searchParams.has('probe')) {
    return NextResponse.json({ versao: 'domingo-20h' })
  }
  // ?teste=1 marca a mensagem como envio de teste (disparo manual autorizado).
  const teste = url.searchParams.has('teste')

  try {
    const resultado = await gerarRelatorioSemanal({ enviarWhatsApp: true, teste })
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
