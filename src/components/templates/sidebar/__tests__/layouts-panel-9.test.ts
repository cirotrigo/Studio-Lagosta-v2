/**
 * H9 (#9): o painel de Layouts REAL renderizado estático (react-dom/server) com a vitrine REAL (a mesma montagem do GET
 * da rota): o #9 desenha a caixa da foto EMBAIXO com o topo em arco (o path da vitrine num `<svg viewBox="0 0 100 100"
 * preserveAspectRatio="none">`, o mecanismo da barra de imagem) e a legenda diz onde a foto está; o #8 segue retangular e
 * com a legenda de hoje. Os hooks de dados e os contextos do editor são dublês — não é o editor completo.
 */
import { describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ pagina: { id: 'p1', width: 1080, height: 1920 } as Record<string, unknown>, vitrine: null as unknown }))

vi.mock('@/contexts/template-editor-context', () => ({ useTemplateEditor: () => ({ templateId: 77 }) }))
vi.mock('@/contexts/multi-page-context', () => ({ useMultiPage: () => ({ currentPage: estado.pagina, setCurrentPageId: () => undefined }) }))
vi.mock('@/components/templates/page-sync-wrapper', () => ({ usePageSync: () => null }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => undefined }) }))
vi.mock('@/hooks/use-layouts', () => ({
  useLayouts: () => ({ data: estado.vitrine, isLoading: false, isError: false, refetch: () => undefined }),
  useCriarPaginaDeLayout: () => ({ mutateAsync: async () => undefined }),
  useAbrirPaginaCriada: () => async () => undefined,
}))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { vitrineDeArquetipos } from '@/lib/compositor/arquetipos/na-spec'
import { LayoutsPanel } from '../layouts-panel'

const ARCO = 'minimal-divisao-cor-topo-arco'
/** Os paths das peças Bv3 aceitas (o mesmo GOLDEN de `mascara-9.test.ts`). */
const GOLDEN = {
  story: 'M0 100 L0 24.566 C 5.7585 16.952 13.286 10.7601 21.9728 6.4921 C 30.6597 2.2241 40.2613 0 50 0 C 59.7387 0 69.3403 2.2241 78.0272 6.4921 C 86.714 10.7601 94.2415 16.952 100 24.566 L100 100 Z',
  feed: 'M0 100 L0 36.1991 C 5.7585 24.9795 13.286 15.8555 21.9728 9.5664 C 30.6597 3.2773 40.2613 0 50 0 C 59.7387 0 69.3403 3.2773 78.0272 9.5664 C 86.714 15.8555 94.2415 24.9795 100 36.1991 L100 100 Z',
}

/** A vitrine como o GET da rota a monta (a mesma conta de `route.ts`). */
function vitrineDoGet() {
  const arquetipos = vitrineDeArquetipos().map((a) => {
    const d = verArquetipo(a.id, a.versao)
    const geometria = Object.fromEntries(
      a.formatos.map((f) => [f, Object.fromEntries(Object.entries(d?.formatos[f]?.papeis ?? {}).flatMap(([papel, pos]) => ('referencia' in pos ? [[papel, pos.referencia]] : [])))]),
    )
    return { ...a, papeis: d?.papeis ?? [], geometria }
  })
  return { arquetipos, assinatura: { disponivel: true } }
}
const render = (pagina: Record<string, unknown>) => {
  estado.pagina = pagina
  estado.vitrine = vitrineDoGet()
  return renderToStaticMarkup(createElement(LayoutsPanel))
}
const card = (html: string, id: string) => {
  const ini = html.indexOf(`data-layout="${id}"`)
  const fim = html.indexOf('data-layout="', ini + 1)
  return html.slice(ini, fim === -1 ? undefined : fim)
}

describe('H9 · painel de Layouts com o #9', () => {
  for (const [formato, pagina, topo, altura] of [
    ['story', { id: 'p1', width: 1080, height: 1920 }, 42, 58],
    ['feed', { id: 'p2', width: 1080, height: 1350 }, 44, 56],
  ] as const) {
    it(`H-02 ${formato}: 10 cards (IH #10; o #4 guardado); o #9 com a caixa embaixo (${topo}% / ${altura}%), o arco do path da vitrine e a legenda nova; #8 e foto inteira como antes`, () => {
      const html = render(pagina)
      const ids = [...html.matchAll(/data-layout="([^"]+)"/g)].map((m) => m[1])
      expect(ids).toHaveLength(10)
      expect(new Set(ids).size).toBe(10)
      // R-04: o #9 é o 1º card (a ordem do catálogo, por id); IH #10: os 2 da coluna entram antes → 3º.
      expect(ids[2]).toBe(ARCO)
      const d9 = card(html, ARCO)
      expect(d9).toContain('data-fundo="foto-em-caixa"')
      const caixa = d9.match(/data-caixa-da-foto="true" class="absolute" style="left:0%;top:([\d.]+)%;width:100%;height:([\d.]+)%"/)
      expect(Number(caixa?.[1])).toBeCloseTo(topo, 6)
      expect(Number(caixa?.[2])).toBeCloseTo(altura, 6)
      expect(d9.match(/data-mascara-da-foto/g)).toHaveLength(1)
      // A proporção do svg = a da caixa (no celular o globals.css força `svg { height: auto !important }`).
      const svg = d9.match(/<svg data-mascara-da-foto="true" viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full" style="aspect-ratio:([\d.]+) \/ ([\d.]+)">/)
      const [pw, ph] = formato === 'story' ? [9, 16] : [4, 5]
      expect(Number(svg?.[1]) / Number(svg?.[2])).toBeCloseTo((1 * pw) / ((altura / 100) * ph), 6)
      expect(d9).toContain(`<path d="${GOLDEN[formato]}" fill="url(#foto-${ARCO}-${formato})"></path>`)
      expect(d9).toContain(`<linearGradient id="foto-${ARCO}-${formato}"`)
      expect(d9).toContain('Foto embaixo com o topo em arco · fundo da marca em cima')
      expect(d9).not.toContain('Foto no alto')
      // Controles: o #8 retangular, sem máscara, com a legenda de hoje; um de foto inteira sem caixa.
      const d8 = card(html, 'minimal-divisao-foto-topo')
      expect(d8).not.toContain('data-mascara-da-foto')
      expect(d8).toContain('Foto no alto · fundo da marca embaixo')
      expect(d8).toMatch(/data-caixa-da-foto="true" class="absolute" style="left:0%;top:0%;width:100%;height:[\d.]+%;background:linear-gradient\(160deg, #3a3a3a 0%, #1c1c1c 55%, #0f0f0f 100%\)"><\/span>/)
      const deFoto = card(html, 'minimal-fb-topo-esquerda')
      expect(deFoto).toContain('data-fundo="foto"')
      expect(deFoto).not.toContain('data-caixa-da-foto')
      expect(deFoto).not.toContain('data-mascara-da-foto')
    })
  }
})
