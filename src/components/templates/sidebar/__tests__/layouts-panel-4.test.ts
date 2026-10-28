/**
 * G-U1 (#4): o painel de Layouts REAL renderizado estático (react-dom/server) com a vitrine REAL (a mesma montagem do GET
 * da rota): desde 25/10 o #4 está guardado fora da vitrine — nenhum card dele, 10 cards; os controles exigem presença. Os hooks de dados e os contextos do editor são dublês — não é o editor
 * completo.
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
/** O recorte do card pelo id; LANÇA quando o id não está no HTML (sem isso, um `not.toContain` contra card ausente passava vazio). */
const card = (html: string, id: string) => {
  const ini = html.indexOf(`data-layout="${id}"`)
  if (ini === -1) throw new Error(`card ${id} ausente do painel`)
  const fim = html.indexOf('data-layout="', ini + 1)
  return html.slice(ini, fim === -1 ? undefined : fim)
}

/** As caixas de papel do card: [rótulo, left, top, width, height] em %. */
const caixas = (html: string) =>
  [...html.matchAll(/style="left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%"><span[^>]*>([^<]+)</g)].map((m) => [m[5], ...m.slice(1, 5).map(Number)] as [string, number, number, number, number])

describe('G-U1 · painel de Layouts sem o #4 (guardado)', () => {
  for (const [formato, pagina] of [
    ['story', { id: 'p1', width: 1080, height: 1920 }],
    ['feed', { id: 'p2', width: 1080, height: 1350 }],
  ] as const) {
    it(`${formato}: nenhum card do #4, 10 cards; o card() lança para o id ausente`, () => {
      const html = render(pagina)
      const ids = [...html.matchAll(/data-layout="([^"]+)"/g)].map((m) => m[1])
      expect(ids).toHaveLength(10)
      expect(new Set(ids).size).toBe(10)
      expect(ids).not.toContain('minimal-fb-base-centro')
      expect(() => card(html, 'minimal-fb-base-centro')).toThrow('ausente')
      // Controle (presença exigida pelo card()): o #8 continua com a caixa da foto; o #2 (base-esquerda) com a logo no canto direito.
      expect(card(html, 'minimal-divisao-foto-topo')).toContain('data-caixa-da-foto')
      expect(Object.fromEntries(caixas(card(html, 'minimal-fb-base-esquerda')).map(([r, ...n]) => [r, n])).logo[0]).toBeCloseTo(74, 6)
    })
  }
})
