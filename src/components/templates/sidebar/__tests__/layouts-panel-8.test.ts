/**
 * G-L5 (#8): o painel de Layouts REAL renderizado estático (react-dom/server) com a vitrine REAL (a mesma montagem do GET
 * da rota): um card por id; o #8 desenha a caixa da foto (frações da vitrine) e o resto no liso claro neutro, com a
 * legenda; o #15 e o #16 como antes. Os hooks de dados e os contextos do editor são dublês — não é o editor completo.
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

describe('G-L5 · painel de Layouts com o #8', () => {
  for (const [formato, pagina, h] of [
    ['story', { id: 'p1', width: 1080, height: 1920 }, 60],
    ['feed', { id: 'p2', width: 1080, height: 1350 }, 58],
  ] as const) {
    it(`${formato}: um card por id; o #8 com a caixa da foto (${h}%) e a legenda; #15 e #16 como antes`, () => {
      const html = render(pagina)
      const ids = [...html.matchAll(/data-layout="([^"]+)"/g)].map((m) => m[1])
      // H9: o #9@1 publicado → 10 cards; IH #10: os 2 da coluna → 12; o #4 guardado fora da vitrine (25/10) → 11; o #3 guardado (26/10) → 10.
      expect(ids).toHaveLength(10)
      expect(new Set(ids).size).toBe(10)
      const d8 = card(html, 'minimal-divisao-foto-topo')
      expect(d8).toContain('data-fundo="foto-em-caixa"')
      const caixa = d8.match(/data-caixa-da-foto="true" class="absolute" style="left:0%;top:0%;width:100%;height:([\d.]+)%/)
      expect(Number(caixa?.[1])).toBeCloseTo(h, 6)
      expect(d8).toContain('Foto no alto · fundo da marca embaixo')
      expect(d8).toContain('background:#F2F0EB')
      expect(d8.match(/data-caixa-da-foto/g)).toHaveLength(1)
      // Os de antes: o #15 e o #16 sem foto, sem caixa; um de foto, sem caixa e sem legenda nova.
      for (const id of ['minimal-tipografico-lista', 'minimal-tipografico-convite']) {
        expect(card(html, id)).toContain('data-fundo="liso-claro"')
        expect(card(html, id)).toContain('Sem foto · fundo claro da marca')
        expect(card(html, id)).not.toContain('data-caixa-da-foto')
      }
      const deFoto = card(html, 'minimal-fb-topo-esquerda')
      expect(deFoto).toContain('data-fundo="foto"')
      expect(deFoto).not.toContain('data-caixa-da-foto')
      expect(deFoto).not.toContain('Foto no alto')
    })
  }
})
