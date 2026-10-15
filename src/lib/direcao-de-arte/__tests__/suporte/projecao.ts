/**
 * A PROJEÇÃO estável de uma composição para os snapshots de referência (baseline) sem arquétipo — T1a e CP2B.
 *
 * Posições, tamanhos, estilos, ids, a escolha de posição, a logo, os blocos, as medidas finais, os gradientes
 * (borda, altura, cor), o tratamento por borda (estado, cor) e a spec/ fieldValues gravados. Fica de fora o que
 * vem do raster no último bit (pontuações, forças, percentis).
 */
import { createHash } from 'node:crypto'

import type { Layer } from '@/types/template'
import type { ResultadoDaComposicao } from '@/lib/compositor/compor'
import { specComAPosicaoOriginal } from '@/lib/compositor/defasagem'

export const token = (u: unknown) => (typeof u === 'string' && u.startsWith('data:') ? `data:${createHash('sha1').update(u).digest('hex').slice(0, 12)}` : u)
const ehGradiente = (l: Layer) => l.type === 'gradient' || l.type === 'gradient2'
const semNumeros = (s: string) => s.replace(/\d+(?:[.,]\d+)?/g, '#')

export function projecao(r: ResultadoDaComposicao, entrada: Record<string, any> | undefined) {
  const d = r.diagnostico
  return {
    layers: r.layers.map((l) =>
      ehGradiente(l)
        ? { id: l.id, type: l.type, order: l.order, position: l.position, size: l.size, borda: (l.metadata as Record<string, unknown> | undefined)?.borda, cor: (l.style as { gradientStops?: Array<{ color?: string }> })?.gradientStops?.[0]?.color }
        : { ...l, fileUrl: token(l.fileUrl) },
    ),
    chavesDoDiagnostico: Object.keys(d).sort(),
    posicao: { ancora: d.posicao.ancora, alinha: d.posicao.alinha, crop: d.posicao.crop },
    candidatos: d.candidatos.map((c) => [c.ancora, c.alinha, c.crop, c.descartado]),
    assuntoOrigem: d.assuntoOrigem,
    // CP3 acrescentou `legibilidade` (só leitura) ao diagnóstico da logo; o baseline projeta a logo como antes.
    logo: d.logo ? { canto: d.logo.canto, tinta: d.logo.tinta } : d.logo,
    blocos: d.blocos,
    medidasFinais: d.medidasFinais,
    arranjos: d.arranjos,
    segundaVoz: d.segundaVoz,
    assinatura: d.assinatura,
    gradientes: d.gradientes?.map(({ borda, altura, cor, origemDaCor }) => ({ borda, altura, cor, origemDaCor })),
    tratamento: d.tratamentoDeLeitura?.map(({ borda, estado, cor, origemDaCor, textos }) => ({ borda, estado, cor, origemDaCor, textos: textos.map(({ camada, polaridade }) => ({ camada, polaridade })) })),
    avisos: d.avisos.map(semNumeros),
    persist: entrada
      ? {
          chaves: Object.keys(entrada.fieldValues).sort(),
          spec: entrada.fieldValues.spec,
          // A recomposição congela a posição a partir do diagnóstico gravado — o caminho sem arquétipo, intacto.
          specDaRecomposicao: specComAPosicaoOriginal(entrada.fieldValues.spec, entrada.fieldValues),
        }
      : null,
  }
}
