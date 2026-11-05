/**
 * G3 · painel Propriedades REAL (`PropertiesPanel`) com célula de grade: posição e tamanho valem para a grade inteira
 * (translação e `refazerGrade` pelas operações do G3, um desfazer), rotação bloqueada, URL/ajuste/editor de imagem
 * bloqueados com motivo; foto avulsa como sempre. Host sem DOM do G1; props CHAMADAS direto (não é navegador).
 * Dublês: `use-pages`, toast, medidor, marca/projeto e os componentes do Radix e modais que precisam de DOM.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  toasts: [] as Array<{ description?: string; variant?: string }>,
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { description?: string; variant?: string }) => void h.toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})
vi.mock('@/lib/grades/medir-foto', () => ({ medirFotoNoNavegador: async (url: string) => ({ src: url, width: 1600, height: 1200 }) }))
vi.mock('konva', () => ({ default: {} }))
vi.mock('@/hooks/use-brand-colors', () => ({ useBrandColors: () => ({ data: [] }), useBrandColorsEstrita: () => ({ data: [] }) }))
vi.mock('@/hooks/use-project', () => ({ useProject: () => ({ data: {} }) }))
vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react')
  const passa = ({ children }: { children?: React.ReactNode }) => React.createElement('caixa', null, children)
  return { Tabs: passa, TabsList: passa, TabsTrigger: passa, TabsContent: passa }
})
vi.mock('@/components/ui/scroll-area', async () => {
  const React = await import('react')
  return { ScrollArea: ({ children }: { children?: React.ReactNode }) => React.createElement('caixa', null, children), ScrollBar: () => null }
})
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  const passa = ({ children }: { children?: React.ReactNode }) => React.createElement('caixa', null, children)
  return { Select: (p: Record<string, unknown>) => React.createElement('select-dublado', p), SelectContent: passa, SelectItem: passa, SelectTrigger: passa, SelectValue: () => null }
})
vi.mock('@/components/ui/switch', () => ({ Switch: () => null }))
vi.mock('@/components/ui/slider', () => ({ Slider: () => null }))
vi.mock('@/components/templates/brand-color-swatches', () => ({ BrandColorSwatches: () => null }))
vi.mock('@/components/templates/modals/image-editor-modal', () => ({ ImageEditorModal: () => null }))
vi.mock('@/components/templates/video-properties', () => ({ VideoProperties: () => null }))
vi.mock('@/components/templates/gradient-editor', () => ({ GradientEditor: () => null }))
vi.mock('@/components/templates/fundo-de-texto-controls', () => ({ FundoDeTextoControls: () => null }))
vi.mock('@/components/canvas/effects/ColorPicker', () => ({ ColorPicker: () => null }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { PropertiesPanel } from '@/components/templates/properties-panel'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const GRADE = ['d0', 'd1', 'd2', 'd3']
const avulsa = { id: 'foto', type: 'image', name: 'Foto', visible: true, locked: false, order: 0, position: { x: 30, y: 40 }, size: { width: 400, height: 300 }, rotation: 0, fileUrl: A, style: { objectFit: 'cover' } } as Layer
const design = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers }) as DesignData
const json = (d: DesignData) => JSON.stringify(d)

type No = { type: string; props: Record<string, unknown>; filhos: unknown[] }
const raiz: { atual: No | null } = { atual: null }
const sonda: { ctx: TemplateEditorContextValue | null } = { ctx: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  return null
}
const ctx = () => sonda.ctx!
const camada = (id: string) => ctx().design.layers.find((l) => l.id === id)!
function nos(no: unknown = raiz.atual): No[] {
  if (!no || typeof no !== 'object' || !('filhos' in no)) return []
  const n = no as No
  return [n, ...n.filhos.flatMap((f) => nos(f))]
}
const textoDe = (no: unknown): string =>
  no && typeof no === 'object' ? ('texto' in no ? String((no as { texto: string }).texto) : 'filhos' in no ? (no as No).filhos.map(textoDe).join('') : '') : ''
const achar = (f: (n: No) => boolean) => nos().find(f)
const rotulado = (r: string) => {
  const n = achar((x) => x.props?.['aria-label'] === r)
  if (!n) throw new Error(`sem nó "${r}"`)
  return n
}
const correr = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}
// `f()` NÃO é aguardado dentro do act: promessa que só resolve no updater travaria o act (deadlock visto no G2)
const agir = (f: () => unknown) =>
  emAct(async () => {
    f()
    await correr()
  })

let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData, sel: string[]) {
  h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1350, layers: d.layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
  const t: TemplateResource = { id: 1, name: 'T', type: 'FEED', dimensions: '1080x1350', designData: d, dynamicFields: [], projectId: 5 }
  const m = await montar(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(
        MultiPageProvider,
        { templateId: 1, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
        React.createElement(
          TemplateEditorProvider,
          { template: t } as React.ComponentProps<typeof TemplateEditorProvider>,
          React.createElement('raiz-do-teste', { ref: (n: No | null) => void (raiz.atual = n) }, React.createElement(PropertiesPanel), React.createElement(Sonda)),
        ),
      ),
    ),
  )
  desmontar = m.desmontar
  await agir(() => ctx().selectLayers(sel))
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  h.toasts.length = 0
})
const sair = (rotulo: string, valor: string) => agir(() => (rotulado(rotulo).props.onBlur as (e: unknown) => void)({ target: { value: valor } }))

describe('G3 · Propriedades de uma célula vinculada', () => {
  it('X/Y movem a grade INTEIRA (um desfazer); largura/altura refazem a grade pela caixa nova', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])), ['d3'])
    expect(rotulado('Posição X da grade').props.defaultValue).toBe(0)
    expect(rotulado('Largura da grade').props.defaultValue).toBe(1080)
    const inicial = json(ctx().design)
    await sair('Posição X da grade', '25')
    expect(GRADE.map((id) => camada(id).position.x)).toEqual([25, 570, 25, 570])
    expect(metadadoDeGrade(camada('d0'))!.caixa.x).toBe(25)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)

    await sair('Altura da grade', '1000')
    expect(metadadoDeGrade(camada('d0'))!.caixa).toEqual({ x: 0, y: 0, w: 1080, h: 1000 })
    expect(camada('d0').fileUrl).toBe(A)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect(textoDe(raiz.atual)).toMatch(/grade inteira/i)
  })

  it('rotação, URL, ajuste da imagem e editor bloqueados com motivo (nada do painel genérico corrompe a célula)', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])), ['d0'])
    expect(rotulado('Rotação da grade').props).toMatchObject({ disabled: true, title: expect.stringMatching(/rota/i) })
    expect(achar((n) => n.props?.id === 'layer-file-url')?.props).toMatchObject({ disabled: true, title: expect.stringMatching(/Imagens/) })
    expect(achar((n) => n.type === 'select-dublado')?.props).toMatchObject({ disabled: true })
    const editar = achar((n) => n.type === 'button' && textoDe(n) === 'Editar')!
    expect(editar.props).toMatchObject({ disabled: true, title: expect.stringMatching(/grade/i) })
  })
})

describe('G3 · Propriedades da foto avulsa (inalterado)', () => {
  it('X, rotação e URL editam a própria camada como antes', async () => {
    await abrir(design([avulsa]), ['foto'])
    expect(achar((n) => n.props?.['aria-label'] === 'Posição X da grade')).toBeUndefined()
    const numeros = nos().filter((n) => n.type === 'input' && n.props.type === 'number')
    await agir(() => (numeros[0].props.onChange as (e: unknown) => void)({ target: { value: '77' } }))
    expect(camada('foto').position).toEqual({ x: 77, y: 40 })
    await agir(() => (numeros[4].props.onChange as (e: unknown) => void)({ target: { value: '15' } }))
    expect(camada('foto').rotation).toBe(15)
    const url = achar((n) => n.props?.id === 'layer-file-url')!
    expect(url.props.disabled).toBeUndefined()
    expect(achar((n) => n.type === 'select-dublado')?.props.disabled).toBeUndefined()
  })
})
