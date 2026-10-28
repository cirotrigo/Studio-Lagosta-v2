/**
 * V-06 (#5): o painel de Layouts REAL renderizado estático (react-dom/server) com a vitrine REAL (a mesma montagem do GET
 * da rota): o card do #5 é de foto inteira, com a logo centrada no topo, os rótulos Título, Apoio, Serviço e logo e o
 * acento "pílula de contorno". Os hooks de dados e os contextos do editor são dublês — não é o editor completo.
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

describe('V-06 · painel de Layouts com o #5', () => {
  for (const [formato, pagina, yTitulo] of [
    ['story', { id: 'p1', width: 1080, height: 1920 }, 15.5],
    ['feed', { id: 'p2', width: 1080, height: 1350 }, 16],
  ] as const) {
    it(`${formato}: o card do #5 é de foto inteira, com a logo centrada no topo, o serviço na base e o acento "pílula de contorno"`, () => {
      const html = render(pagina)
      const d5 = card(html, 'minimal-fb-topo-centro')
      expect(d5).toContain('data-fundo="foto"')
      expect(d5).not.toContain('data-caixa-da-foto')
      expect(d5).toContain('Acento: pílula de contorno')
      expect(d5).toContain('Foto inteira, título centrado no topo, serviço em pílula')
      const porRotulo = Object.fromEntries(caixas(d5).map(([r, ...n]) => [r, n]))
      expect(Object.keys(porRotulo).sort()).toEqual(['Apoio', 'Serviço', 'Título', 'logo'])
      const [left, top, width] = porRotulo.logo
      expect(left + width / 2).toBeCloseTo(50, 6)
      expect(top).toBeCloseTo(10.5, 6)
      expect(porRotulo['Título'][1]).toBeCloseTo(yTitulo, 6)
      for (const r of ['Título', 'Apoio', 'Serviço']) expect(porRotulo[r][0] + porRotulo[r][2] / 2, r).toBeCloseTo(50, 6)
      expect(porRotulo['Serviço'][1]).toBeGreaterThan(80)
      // Controles (presença exigida pelo card()): o título gigante sem acento — o #4, guardado (25/10), não tem card —; o
      // #16@2 com as cantoneiras; o #8 com a caixa da foto.
      expect(html).not.toContain('data-layout="minimal-fb-base-centro"')
      expect(() => card(html, 'minimal-fb-base-centro')).toThrow('ausente')
      const gigante = card(html, 'minimal-titulo-gigante')
      expect(gigante).toContain('data-layout="minimal-titulo-gigante"')
      expect(gigante).not.toContain('Acento:')
      expect(card(html, 'minimal-tipografico-convite')).toContain('cantoneiras nos 4 cantos')
      expect(card(html, 'minimal-divisao-foto-topo')).toContain('data-caixa-da-foto')
    })
  }
})
