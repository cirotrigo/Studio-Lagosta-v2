/**
 * Cron: pauta de fotografia — toda SEGUNDA 09:00 BRT (12:00 UTC).
 *
 * Mede o acervo de cada cliente (pilar × catálogo, pilar × destacadas, buscas
 * de foto que morreram), monta o PDF e o manda como documento no grupo do
 * WhatsApp — com a pauta em texto como fallback. Ver
 * src/lib/relatorios/pauta-fotografos.ts; nasceu do brief manual de
 * 30/08/2026 (docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md, F5.1).
 */
import { NextRequest, NextResponse } from 'next/server'
import { enviarPautaDeFotografia } from '@/lib/relatorios/pauta-fotografos'

export const runtime = 'nodejs'
// Inline de propósito: o glob do vercel.json é app/api/** e o projeto é src/app/**.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Pauta Fotografos] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  // Sonda sem efeito: confirma qual versão está no ar antes de um disparo manual.
  if (url.searchParams.has('probe')) {
    return NextResponse.json({ versao: 'segunda-09h' })
  }
  // ?teste=1 marca a mensagem como envio de teste (disparo manual autorizado).
  const teste = url.searchParams.has('teste')

  try {
    const resultado = await enviarPautaDeFotografia({ teste })
    console.log(
      `[Pauta Fotografos] ${resultado.geradaEm}: ${resultado.clientes} clientes, ${resultado.prioridades} prioridades, ` +
        `${resultado.enviado ? (resultado.viaPdf ? 'PDF enviado' : 'texto enviado (fallback)') : 'NÃO enviado'}`,
    )
    return NextResponse.json({ success: true, ...resultado })
  } catch (error) {
    console.error('[Pauta Fotografos] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
