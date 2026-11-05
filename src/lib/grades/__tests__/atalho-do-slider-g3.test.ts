/**
 * G3 · QA real no navegador (27/10): a seta no slider de Espaçamento da barra da grade também chegava ao atalho GLOBAL do
 * canvas (`keydown` em `window`) e movia a grade 1 px enquanto o ajuste media a foto — a assinatura mudava e o ajuste era
 * recusado (ALVO_MUDOU: "A grade ou a página mudou enquanto as fotos eram medidas…").
 *
 * Aqui o `EditorCanvas` REAL, dentro dos providers reais, registra o seu ouvinte num `window` dublado (só ouvintes) e a
 * `GradeToolbar` real está montada. O evento chega como o navegador o entrega DEPOIS do Slider do Radix: `Event` real com
 * alvo dentro de `role="slider"` e `defaultPrevented` (o `onKeyDown` do Radix Slider 1.3.6 chama `preventDefault` nas
 * setas, Home/End e PageUp/PageDown antes de o evento subir). O commit do slider é o que o Radix faz numa seta
 * (`onValueCommit` com o passo). Elemento é um dublê mínimo: `tagName`, `isContentEditable` e `closest` pelo `role` dos
 * ancestrais. Dublês: os do barra-da-grade (Slider/Popover/use-pages/toast/use-image/konva) e os filhos pesados do canvas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  toasts: [] as Array<{ description?: string; variant?: string }>,
  ouvintes: new Set<(e: Event) => void>(),
  nada: () => null,
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { description?: string; variant?: string }) => void h.toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})
// A medida da foto leva um tique (no navegador ela carrega a imagem): é nessa janela que o atalho chegava
vi.mock('@/lib/grades/medir-foto', () => ({
  medirFotoNoNavegador: async (url: string) => {
    await new Promise((r) => setTimeout(r, 0))
    return { src: url, width: 1600, height: 1200 }
  },
}))
vi.mock('use-image', () => ({ default: () => [undefined, 'loading'] }))
vi.mock('konva', () => ({ default: { Layer: class {} } }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/hooks/use-editor-view-mode', () => ({ useEditorViewMode: () => ({ viewMode: 'single' }) }))
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }))
vi.mock('@/components/ui/slider', async () => {
  const React = await import('react')
  return { Slider: (props: Record<string, unknown>) => React.createElement('slider', props) }
})
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react')
  const passa = ({ children }: { children?: React.ReactNode }) => React.createElement('caixa', null, children)
  return { Popover: passa, PopoverTrigger: passa, PopoverContent: passa }
})
vi.mock('@/components/templates/text-toolbar', () => ({ TextToolbar: h.nada }))
vi.mock('@/components/templates/image-toolbar', () => ({ ImageToolbar: h.nada }))
vi.mock('@/components/templates/shape-toolbar', () => ({ ShapeToolbar: h.nada }))
vi.mock('@/components/templates/alignment-toolbar', () => ({ AlignmentToolbar: h.nada }))
vi.mock('@/components/templates/rich-text-editor-host', () => ({ RichTextEditorHost: h.nada }))
vi.mock('@/components/templates/motor-da-pagina', () => ({ MotorDaPagina: h.nada }))
vi.mock('@/components/templates/zoom-controls', () => ({ ZoomControls: h.nada }))
vi.mock('@/components/canvas/effects', () => ({ EffectsPanel: h.nada }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { EditorCanvas } from '@/components/templates/editor-canvas'
import { MENSAGEM_AJUSTE_FORA_DO_ALVO } from '@/lib/grades/ajustes'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const GRADE = ['d0', 'd1', 'd2', 'd3']
const design = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1920, backgroundColor: '#fff' }, layers }) as DesignData

// ── Árvore e contexto ───────────────────────────────────────────────────────
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
const slider = (rotulo: string) => {
  const n = nos().find((x) => x.type === 'slider' && x.props?.['aria-label'] === rotulo)
  if (!n) throw new Error(`sem slider "${rotulo}"`)
  return n.props as { value: number[]; onValueCommit: (v: number[]) => void }
}
const correr = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0))
}
const agir = (f: () => unknown) =>
  emAct(async () => {
    f()
    await correr()
  })

// ── Elementos e eventos como o navegador entrega ao ouvinte de `window` ─────
type Elemento = { tagName: string; isContentEditable: boolean; role?: string; pai?: Elemento; closest: (seletor: string) => Elemento | null }
function elemento(tagName: string, role?: string, pai?: Elemento): Elemento {
  const el: Elemento = {
    tagName,
    isContentEditable: false,
    role,
    pai,
    // só o que o guard pede: `[role="…"]` nos ancestrais (o próprio incluído)
    closest: (seletor) => {
      for (let n: Elemento | undefined = el; n; n = n.pai) if (n.role && seletor.includes(`[role="${n.role}"]`)) return n
      return null
    },
  }
  return el
}
const raizDoSlider = elemento('SPAN', undefined, elemento('DIV'))
const polegarDoSlider = elemento('SPAN', 'slider', raizDoSlider)
const areaDoCanvas = elemento('DIV')
const campoDeLargura = elemento('INPUT')
const itemDeMenu = elemento('DIV', 'menuitem', elemento('DIV', 'menu'))

function tecla(key: string, alvo: Elemento, { tratadoPeloControle = false, shiftKey = false } = {}) {
  const ev = new Event('keydown', { bubbles: true, cancelable: true })
  Object.defineProperties(ev, {
    key: { value: key },
    target: { value: alvo },
    shiftKey: { value: shiftKey },
    metaKey: { value: false },
    ctrlKey: { value: false },
    altKey: { value: false },
  })
  if (tratadoPeloControle) ev.preventDefault() // o controle (Radix) já tratou a tecla antes de ela subir ao window
  return ev
}
const disparar = (ev: Event) => [...h.ouvintes].forEach((f) => f(ev))

// ── Montagem ────────────────────────────────────────────────────────────────
let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData) {
  h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1920, layers: d.layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
  const t: TemplateResource = { id: 1, name: 'T', type: 'STORY', dimensions: '1080x1920', designData: d, dynamicFields: [], projectId: 5 }
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
          React.createElement('raiz-do-teste', { ref: (n: No | null) => void (raiz.atual = n) }, React.createElement(EditorCanvas), React.createElement(Sonda)),
        ),
      ),
    ),
  )
  desmontar = m.desmontar
  await emAct(correr)
}
beforeEach(() => {
  vi.stubGlobal('window', {
    addEventListener: (tipo: string, f: (e: Event) => void) => void (tipo === 'keydown' && h.ouvintes.add(f)),
    removeEventListener: (tipo: string, f: (e: Event) => void) => void (tipo === 'keydown' && h.ouvintes.delete(f)),
    location: { href: 'https://studio.test/' },
    innerWidth: 1280,
  })
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0))
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
})
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  vi.unstubAllGlobals()
  h.toasts.length = 0
  h.ouvintes.clear()
})

const posicoes = () => GRADE.map((id) => camada(id).position)
const caixaX = () => metadadoDeGrade(camada('d0'))!.caixa.x
const recusas = () => h.toasts.filter((t) => t.description === MENSAGEM_AJUSTE_FORA_DO_ALVO)

async function abrirComGradeSelecionada() {
  await abrir(design(doisPorDois([A, '', '', ''])))
  await agir(() => ctx().selectLayers(GRADE))
  expect(h.ouvintes.size).toBe(1) // o atalho global do EditorCanvas está ligado
  expect(slider('Espaçamento').value).toEqual([10])
}

describe('G3 · seta no slider da grade × atalho global do canvas (EditorCanvas real)', () => {
  it('a seta no slider de Espaçamento grava o espaçamento e NÃO move a grade (o caso da QA: antes movia e o ajuste era recusado)', async () => {
    await abrirComGradeSelecionada()
    const antes = posicoes()
    await agir(() => {
      slider('Espaçamento').onValueCommit([11]) // o passo que o Radix grava na seta
      disparar(tecla('ArrowRight', polegarDoSlider, { tratadoPeloControle: true })) // e a mesma tecla, subindo ao window
    })
    expect(recusas()).toEqual([])
    expect(metadadoDeGrade(camada('d0'))!.espacamento).toBe(11)
    expect(caixaX()).toBe(0)
    expect(camada('d0').position).toEqual(antes[0])
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })

  it('foco no slider não é atalho do canvas mesmo sem preventDefault (incremento de acessibilidade, setas e Delete)', async () => {
    await abrirComGradeSelecionada()
    const antes = posicoes()
    await agir(() => disparar(tecla('ArrowRight', polegarDoSlider)))
    await agir(() => disparar(tecla('Delete', polegarDoSlider)))
    expect(posicoes()).toEqual(antes)
    expect(ctx().design.layers.map((l) => l.id)).toEqual(GRADE)
  })

  it('tecla que outro controle já tratou (menu aberto) não move a seleção', async () => {
    await abrirComGradeSelecionada()
    const antes = posicoes()
    await agir(() => disparar(tecla('ArrowDown', itemDeMenu, { tratadoPeloControle: true })))
    expect(posicoes()).toEqual(antes)
  })

  it('campo de texto continua fora do atalho (comportamento anterior)', async () => {
    await abrirComGradeSelecionada()
    const antes = posicoes()
    await agir(() => disparar(tecla('ArrowRight', campoDeLargura)))
    expect(posicoes()).toEqual(antes)
  })

  it('no canvas a seta continua movendo a grade inteira: 1 px, e 10 px com Shift', async () => {
    await abrirComGradeSelecionada()
    const antes = posicoes()
    await agir(() => disparar(tecla('ArrowRight', areaDoCanvas)))
    expect(caixaX()).toBe(1)
    expect(posicoes()).toEqual(antes.map((p) => ({ x: p.x + 1, y: p.y })))
    await agir(() => disparar(tecla('ArrowDown', areaDoCanvas, { shiftKey: true })))
    expect(posicoes()).toEqual(antes.map((p) => ({ x: p.x + 1, y: p.y + 10 })))
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })
})
