/**
 * IH #10: o painel de Layouts REAL renderizado estático (react-dom/server) com a vitrine REAL (a mesma montagem do GET
 * da rota): os 2 cards do #10 desenham a caixa da foto como RETÂNGULO de largura parcial (o do #8, sem máscara) à
 * direita (`minimal-coluna-foto`) e à esquerda (`minimal-coluna-foto-esquerda`), e a legenda diz o lado nos DOIS eixos;
 * o #8 ("Foto no alto…") e o #9 ("Foto embaixo com o topo em arco…") continuam com o texto de hoje. Os hooks de dados e
 * os contextos do editor são dublês — não é o editor completo.
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

const D = 'minimal-coluna-foto'
const E = 'minimal-coluna-foto-esquerda'

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

describe('IH #10 · painel de Layouts com a coluna de foto', () => {
  for (const [formato, pagina] of [
    ['story', { id: 'p1', width: 1080, height: 1920 }],
    ['feed', { id: 'p2', width: 1080, height: 1350 }],
  ] as const) {
    it(`L-01/L-02 ${formato}: 10 cards (o #4 guardado); o #10 em 1º e 2º com o retângulo da foto à direita/à esquerda e a legenda pelo lado; #8 e #9 como hoje`, () => {
      const html = render(pagina)
      const ids = [...html.matchAll(/data-layout="([^"]+)"/g)].map((m) => m[1])
      expect(ids).toHaveLength(10)
      expect(new Set(ids).size).toBe(10)
      // A ordem do catálogo (por id): o #10 em 1º e 2º, o #9 em 3º.
      expect(ids.slice(0, 3)).toEqual([D, E, 'minimal-divisao-cor-topo-arco'])
      for (const [id, left, legenda, outra] of [
        [D, 57.5, 'Foto à direita · fundo da marca à esquerda', 'Foto à esquerda'],
        [E, 0, 'Foto à esquerda · fundo da marca à direita', 'Foto à direita'],
      ] as const) {
        const c = card(html, id)
        expect(c).toContain('data-fundo="foto-em-caixa"')
        // O retângulo do #8 (sem svg nem máscara), com a proporção da caixa: largura 42,5%, altura 100%.
        const caixa = c.match(/data-caixa-da-foto="true" class="absolute" style="left:([\d.]+)%;top:0%;width:([\d.]+)%;height:100%;background:linear-gradient\(160deg, #3a3a3a 0%, #1c1c1c 55%, #0f0f0f 100%\)"><\/span>/)
        expect(caixa, c.slice(0, 600)).not.toBeNull()
        expect(Number(caixa?.[1])).toBeCloseTo(left, 6)
        expect(Number(caixa?.[2])).toBeCloseTo(42.5, 6)
        expect(c).not.toContain('data-mascara-da-foto')
        expect(c).toContain(legenda)
        expect(c).not.toContain(outra)
        expect(c).not.toContain('Foto no alto')
        expect(c).toContain('Acento: ')
      }
      // Controles: o #8 e o #9 com a legenda de hoje.
      expect(card(html, 'minimal-divisao-foto-topo')).toContain('Foto no alto · fundo da marca embaixo')
      const d9 = card(html, 'minimal-divisao-cor-topo-arco')
      expect(d9).toContain('Foto embaixo com o topo em arco · fundo da marca em cima')
      expect(d9.match(/data-mascara-da-foto/g)).toHaveLength(1)
    })
  }
})
