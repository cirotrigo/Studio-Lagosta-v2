/**
 * G1 · seção "Grades" no painel Elementos REAL, renderizado estático (react-dom/server) dentro do
 * `TemplateEditorProvider` e do `QueryClientProvider` reais. Sem rede: os hooks da marca leem o cache semeado (ou
 * ficam "carregando", que é o caso de a paleta ainda não ter chegado). Não exercita clique — o comportamento de
 * inserir está no teste do provider (`inserir-grade-no-editor.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DesignData, Layer } from '@/types/template'
import { TemplateEditorProvider } from '@/contexts/template-editor-context'
import { ElementosPanel } from '@/components/templates/panels/elementos-panel'
import { SecaoGrades, gradesDaBusca } from '@/components/templates/panels/secao-grades'
import { CATALOGO_DE_GRADES } from '../catalogo'

const PROJETO = 5
function render(canvas: { width: number; height: number }, opcoes: { layers?: Layer[]; filho?: ReturnType<typeof createElement> } = {}) {
  const designData = { canvas: { ...canvas, backgroundColor: '#fff' }, layers: opcoes.layers ?? [] } as DesignData
  const template = { id: 1, name: 'T', type: 'STORY', dimensions: '', designData, dynamicFields: [], projectId: PROJETO }
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(TemplateEditorProvider, { template } as ComponentProps<typeof TemplateEditorProvider>, opcoes.filho ?? createElement(ElementosPanel))),
  )
}
const secao = (html: string) => {
  const ini = html.indexOf('data-secao="grades"')
  if (ini === -1) return ''
  const fim = html.indexOf('data-secao=', ini + 1)
  return html.slice(ini, fim === -1 ? undefined : fim)
}
const botoes = (trecho: string) => [...trecho.matchAll(/<button[^>]*data-grade="([^"]+)"[^>]*>/g)]

describe('G1 · seção Grades no painel Elementos', () => {
  for (const [nome, c] of [
    ['Story', { width: 1080, height: 1920 }],
    ['Feed', { width: 1080, height: 1350 }],
  ] as const) {
    it(`${nome}: os 16 layouts do catálogo (14 + 2 quadradas), em ordem, com nome acessível e miniatura na proporção da página`, () => {
      const html = render(c)
      const s = secao(html)
      expect(s).toContain('Grades')
      const bs = botoes(s)
      expect(bs.map((m) => m[1])).toEqual(CATALOGO_DE_GRADES.map((l) => l.id))
      for (const [i, m] of bs.entries()) expect(m[0]).toContain(`aria-label="Grade ${CATALOGO_DE_GRADES[i].nome}"`)
      const svgs = [...s.matchAll(/<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/g)]
      expect(svgs).toHaveLength(CATALOGO_DE_GRADES.length)
      for (const [i, m] of svgs.entries()) {
        expect(m[1]).toBe(`0 0 ${c.width} ${c.height}`)
        expect(m[2].match(/data-celula/g)).toHaveLength(CATALOGO_DE_GRADES[i].celulas.length)
      }
    })
  }

  it('não herda o bloqueio da paleta: com as cores da marca carregando, formas desabilitadas e grades livres', () => {
    const html = render({ width: 1080, height: 1350 })
    expect(html).toContain('Carregando as cores da marca')
    // o atributo, não a classe `disabled:` do Tailwind
    expect(html).toMatch(/<button[^>]*data-elemento="[^"]+"[^>]*\sdisabled=""/)
    expect(botoes(secao(html))).toHaveLength(CATALOGO_DE_GRADES.length)
    for (const m of botoes(secao(html))) expect(m[0]).not.toMatch(/\sdisabled=""/)
  })

  it('página de vídeo: grades desabilitadas com o motivo escrito', () => {
    const video = { id: 'v', type: 'video', name: 'v', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, fileUrl: 'https://x/v.mp4' } as Layer
    const s = secao(render({ width: 1080, height: 1920 }, { layers: [video] }))
    expect(s).toMatch(/página de vídeo/i)
    expect(botoes(s)).toHaveLength(CATALOGO_DE_GRADES.length)
    for (const m of botoes(s)) expect(m[0]).toMatch(/\sdisabled=""/)
  })

  it('busca: sem acento e sem caixa, pelo nome (× vale x) e pelos termos da seção', () => {
    const ids = (q: string) => gradesDaBusca(q).map((l) => l.id)
    expect(ids('')).toHaveLength(16)
    expect(ids('GRADE')).toHaveLength(16)
    expect(ids('colagem')).toHaveLength(16)
    expect(ids('2x2')).toEqual(['2x2'])
    expect(ids('linhas')).toEqual(['2-linhas', '3-linhas'])
    expect(ids('zzz')).toEqual([])
  })

  it('a seção filtra pela busca e some quando nada casa (o painel só diz "nada encontrado" sem grade casando)', () => {
    const feed = { width: 1080, height: 1350 }
    expect(botoes(secao(render(feed, { filho: createElement(SecaoGrades, { busca: '2x3' }) }))).map((m) => m[1])).toEqual(['2x3'])
    expect(render(feed, { filho: createElement(SecaoGrades, { busca: 'zzz' }) })).toBe('')
  })
})

describe('Q2 · as grades quadradas na seção', () => {
  const rects = (svg: string) =>
    [...svg.matchAll(/<rect[^>]*data-celula="(\d+)"[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/g)].map((m) => m.slice(2).map(Number))
  const miniatura = (s: string, id: string) => {
    const ini = s.indexOf(`data-grade="${id}"`)
    return s.slice(ini, s.indexOf('</button>', ini))
  }

  it('Story: nomes visíveis, 28 e 20 células quadradas na miniatura, com o espaçamento inicial 0 (Story 4×7: margem de 15)', () => {
    const s = secao(render({ width: 1080, height: 1920 }))
    expect(s).toContain('aria-label="Grade Story · 28 fotos quadradas (4×7)"')
    expect(s).toContain('aria-label="Grade Feed retrato · 20 fotos quadradas (4×5)"')
    const q7 = rects(miniatura(s, '4x7-quadrada'))
    const q5 = rects(miniatura(s, '4x5-quadrada'))
    expect([q7.length, q5.length]).toEqual([28, 20])
    for (const [, , w, h] of [...q7, ...q5]) expect(w).toBe(h)
    expect(q7[0]).toEqual([0, 15, 270, 270])
    expect(q7[27]).toEqual([810, 1635, 270, 270])
    // os 14 antigos seguem com o padrão 10: 2×2 no Story = [0,0,535,955]
    expect(rects(miniatura(s, '2x2'))[0]).toEqual([0, 0, 535, 955])
  })

  it('Feed: 4×5 encaixa exato (270, sem margem); a ajuda diz que os quadrados ficam 1:1 e a margem pode sobrar', () => {
    const s = secao(render({ width: 1080, height: 1350 }))
    const q5 = rects(miniatura(s, '4x5-quadrada'))
    expect(q5[0]).toEqual([0, 0, 270, 270])
    expect(q5[19]).toEqual([810, 1080, 270, 270])
    expect(s).toMatch(/data-ajuda="grades-quadradas"[^>]*>[^<]*quadrad[^<]*1:1[^<]*margem[^<]*40/)
    // o encaixe exato com 40 vale para o Story 1080×1920 de 28 fotos, não para qualquer página: a frase diz qual
    expect(s).toContain('No Story 1080×1920 com 28 fotos, o espaçamento 40 encaixa exato.')
  })

  it('a ajuda só aparece quando há grade quadrada na lista; busca acha as quadradas por 4x7, "quadradas" e "story"', () => {
    const feed = { width: 1080, height: 1350 }
    expect(render(feed, { filho: createElement(SecaoGrades, { busca: '2x3' }) })).not.toContain('data-ajuda')
    const ids = (q: string) => gradesDaBusca(q).map((l) => l.id)
    expect(ids('4x7')).toEqual(['4x7-quadrada'])
    expect(ids('quadradas')).toEqual(['4x7-quadrada', '4x5-quadrada'])
    expect(ids('story')).toEqual(['4x7-quadrada'])
    expect(ids('feed retrato')).toEqual(['4x5-quadrada'])
  })
})
