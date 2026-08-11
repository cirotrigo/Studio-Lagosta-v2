import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { reconciliarCatalogo } from '@/lib/creatives/reconciliar-catalogo'
import {
  ORCAMENTO_DA_RODADA_MS,
  haTempo,
  rotacionarPorDia,
  type ResultadoReconciliacao,
} from '@/lib/creatives/reconciliacao'

export const runtime = 'nodejs'
/**
 * ⚠️ INLINE, não no `vercel.json`: o glob de lá é `app/api/**` e o projeto é
 * `src/app/**` — nenhuma entrada casa, e a rota rodaria no default da
 * plataforma.
 */
export const maxDuration = 300

/**
 * Reconciliação diária dos catálogos de acervo (05:00 UTC = 02:00 BRT).
 *
 * Passa em cada projeto com pasta de imagens configurada, tira do
 * `_image-catalog.json` as fotos que sumiram do Drive e cataloga as que
 * apareceram. Ver `src/lib/creatives/reconciliar-catalogo.ts`.
 *
 * ORÇAMENTO DE TEMPO: os projetos são processados EM SEQUÊNCIA com um relógio.
 * A rodada para de pegar projeto novo aos `ORCAMENTO_DA_RODADA_MS` (240s dos
 * 300s de `maxDuration`) e devolve quem ficou de fora — a reconciliação é um
 * diff de ids, então o cron do dia seguinte simplesmente continua. A ordem
 * rotaciona por dia: sem isso, ordem fixa + relógio que corta faria o último
 * projeto nunca ser reconciliado.
 */
export async function GET(req: Request) {
  const inicio = Date.now()
  const prazoEm = inicio + ORCAMENTO_DA_RODADA_MS

  try {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projetos = rotacionarPorDia(
      await db.project.findMany({
        where: { googleDriveImagesFolderId: { not: null } },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
    )

    console.log(`[cron:reconciliar-catalogos] ${projetos.length} projeto(s) com pasta de imagens`)

    const resultados: ResultadoReconciliacao[] = []
    const naoProcessados: Array<{ projectId: number; projeto: string }> = []

    for (const projeto of projetos) {
      if (!haTempo(prazoEm)) {
        naoProcessados.push({ projectId: projeto.id, projeto: projeto.name })
        continue
      }

      try {
        const resultado = await reconciliarCatalogo({ projectId: projeto.id, prazoEm })
        resultados.push(resultado)

        const resumo = resultado.pulado
          ? `pulado (${resultado.pulado})`
          : `${resultado.orfasRemovidas} órfã(s) removida(s), ${resultado.novasCatalogadas} nova(s) catalogada(s), ${resultado.restantes} restante(s), ${resultado.erros} erro(s)`
        console.log(
          `[cron:reconciliar-catalogos] ${projeto.id} ${projeto.name}: ${resumo} em ${resultado.duracaoMs}ms`,
        )
      } catch (error) {
        // Falha num projeto NUNCA vira catástrofe: loga e vai para o próximo.
        const motivo = error instanceof Error ? error.message : 'Erro desconhecido'
        console.error(`[cron:reconciliar-catalogos] ${projeto.id} ${projeto.name} falhou:`, error)
        resultados.push({
          projectId: projeto.id,
          projeto: projeto.name,
          orfasRemovidas: 0,
          novasCatalogadas: 0,
          restantes: 0,
          erros: 1,
          falha: motivo,
          duracaoMs: 0,
        })
      }
    }

    const totais = resultados.reduce(
      (acc, r) => ({
        orfasRemovidas: acc.orfasRemovidas + r.orfasRemovidas,
        novasCatalogadas: acc.novasCatalogadas + r.novasCatalogadas,
        restantes: acc.restantes + r.restantes,
        erros: acc.erros + r.erros,
      }),
      { orfasRemovidas: 0, novasCatalogadas: 0, restantes: 0, erros: 0 },
    )

    const duracaoMs = Date.now() - inicio
    console.log(
      `[cron:reconciliar-catalogos] fim em ${duracaoMs}ms — ${totais.orfasRemovidas} órfã(s), ${totais.novasCatalogadas} nova(s), ${totais.restantes} restante(s), ${totais.erros} erro(s), ${naoProcessados.length} projeto(s) para amanhã`,
    )

    return NextResponse.json({
      success: true,
      totais,
      projetos: resultados,
      naoProcessados,
      duracaoMs,
    })
  } catch (error) {
    console.error('[cron:reconciliar-catalogos] Fatal error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
