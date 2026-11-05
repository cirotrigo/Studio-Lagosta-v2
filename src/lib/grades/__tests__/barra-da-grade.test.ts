/**
 * G3 · LIGAÇÃO da UI real com os ajustes: `GradeToolbar`, `ImageToolbar` e `KonvaSelectionTransformer` reais dentro dos
 * providers reais, no host sem DOM do G1. A árvore é percorrida e os `onClick`/`onValueChange`/`onBlur` são CHAMADOS nas
 * props — não é clique de navegador. Dublês: `use-pages`, toast, medidor, `use-image`, Slider/Popover do Radix (precisam
 * de DOM) e o `Transformer` do react-konva (um objeto com `nodes`/`on`/`keepRatio`; os nós são objetos com x/y/escala).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  toasts: [] as Array<{ description?: string; variant?: string }>,
  transformer: { props: null as Record<string, unknown> | null, nos: [] as unknown[], eventos: new Map<string, () => void>() },
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { description?: string; variant?: string }) => void h.toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})
vi.mock('@/lib/grades/medir-foto', () => ({ medirFotoNoNavegador: async (url: string) => ({ src: url, width: 1600, height: 1200 }) }))
vi.mock('use-image', () => ({ default: () => [undefined, 'loading'] }))
vi.mock('konva', () => ({ default: {} }))
vi.mock('@/components/ui/slider', async () => {
  const React = await import('react')
  return { Slider: (props: Record<string, unknown>) => React.createElement('slider', props) }
})
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react')
  const passa = ({ children }: { children?: React.ReactNode }) => React.createElement('caixa', null, children)
  return { Popover: passa, PopoverTrigger: passa, PopoverContent: passa }
})
vi.mock('react-konva', async () => {
  const React = await import('react')
  const t = h.transformer
  const falso = {
    nodes: (n?: unknown[]) => (n ? void (t.nos = n) : t.nos),
    getLayer: () => ({ batchDraw: () => undefined }),
    getStage: () => null,
    keepRatio: () => undefined,
    on: (evento: string, f: () => void) => void t.eventos.set(evento, f),
    off: (evento: string) => void t.eventos.delete(evento),
  }
  const Transformer = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    t.props = props
    React.useImperativeHandle(ref, () => falso)
    return null
  })
  Transformer.displayName = 'TransformerDublado'
  return { Transformer }
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { GradeToolbar } from '@/components/templates/grade-toolbar'
import { ImageToolbar } from '@/components/templates/image-toolbar'
import { KonvaSelectionTransformer } from '@/components/templates/konva-transformer'
import { TODAS_AS_ANCORAS } from '@/lib/konva/trava-de-proporcao'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { modoDaSelecao } from '../ajustes'
import { criarGrade } from '../operacoes'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const C = `${BLOB}/fotos/c.jpg`
const GRADE = ['d0', 'd1', 'd2', 'd3']
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const avulsa = { id: 'foto', type: 'image', name: 'Foto', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, fileUrl: A, style: { objectFit: 'cover' } } as Layer
const design = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers }) as DesignData
const json = (d: DesignData) => JSON.stringify(d)

// ── Árvore ──────────────────────────────────────────────────────────────────
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
const achar = (f: (n: No) => boolean) => nos().find(f)
const rotulado = (rotulo: string) => {
  const n = achar((x) => x.props?.['aria-label'] === rotulo)
  if (!n) throw new Error(`sem nó "${rotulo}"`)
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

// Nós do Konva no stage dublado: posição e escala
type NoKonva = { id: () => string; x: (v?: number) => number; y: (v?: number) => number; scaleX: (v?: number) => number; scaleY: (v?: number) => number; rotation: (v?: number) => number; position: (p: { x: number; y: number }) => void }
const nosDoStage = new Map<string, NoKonva>()
function noKonva(l: Layer): NoKonva {
  const s = { x: l.position.x, y: l.position.y, sx: 1, sy: 1, r: l.rotation ?? 0 }
  const attr = (k: 'x' | 'y' | 'sx' | 'sy' | 'r') => (v?: number) => (v === undefined ? s[k] : (s[k] = v))
  return { id: () => l.id, x: attr('x'), y: attr('y'), scaleX: attr('sx'), scaleY: attr('sy'), rotation: attr('r'), position: (p) => void Object.assign(s, p) }
}
const stageRef = { current: { findOne: (sel: string) => nosDoStage.get(sel.slice(1)) } }

/** Barra/toolbar/transformer como o editor os monta para a seleção atual */
function Montagem() {
  const { design: d, selectedLayerIds, updateLayer } = useTemplateEditor()
  const unica = selectedLayerIds.length === 1 ? d.layers.find((l) => l.id === selectedLayerIds[0]) : undefined
  const sel = modoDaSelecao(d.layers, selectedLayerIds)
  return React.createElement(
    React.Fragment,
    null,
    sel.modo === 'inteira' ? React.createElement(GradeToolbar, { gradeId: sel.gradeId! }) : null,
    unica?.type === 'image' ? React.createElement(ImageToolbar, { selectedLayer: unica, onUpdateLayer: (id: string, u: Partial<Layer>) => updateLayer(id, (l) => ({ ...l, ...u })) }) : null,
    React.createElement(KonvaSelectionTransformer, { selectedLayerIds, stageRef: stageRef as never }),
  )
}

let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData) {
  h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1350, layers: d.layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
  nosDoStage.clear()
  for (const l of d.layers) nosDoStage.set(l.id, noKonva(l))
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
          React.createElement('raiz-do-teste', { ref: (n: No | null) => void (raiz.atual = n) }, React.createElement(Montagem), React.createElement(Sonda)),
        ),
      ),
    ),
  )
  desmontar = m.desmontar
  await emAct(correr)
}
// O Transformer escuta Shift em `window` e resolve os nós por quadro (o node não tem nenhum dos dois): só ouvintes,
// endereço e o quadro como tarefa — nada de DOM
beforeEach(() => {
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined, location: { href: 'https://studio.test/' }, innerWidth: 1280 })
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0))
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
})
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  vi.unstubAllGlobals()
  h.toasts.length = 0
  h.transformer.props = null
  h.transformer.nos = []
  h.transformer.eventos.clear()
})
const selecionar = (ids: string[]) => agir(() => ctx().selectLayers(ids))
const slider = (rotulo: string) => rotulado(rotulo).props as { value: number[]; onValueChange: (v: number[]) => void; onValueCommit: (v: number[]) => void }

describe('G3 · barra da grade (GradeToolbar real)', () => {
  it('slider de espaçamento: arrastar só mexe no valor da barra; soltar grava UMA vez; dois gestos = dois desfazer; refazer', async () => {
    await abrir(design([...doisPorDois([A, B, '', '']), texto]))
    await selecionar(GRADE)
    const inicial = json(ctx().design)
    expect(slider('Espaçamento').value).toEqual([10])
    await agir(() => slider('Espaçamento').onValueChange([20]))
    await agir(() => slider('Espaçamento').onValueChange([35]))
    expect(json(ctx().design)).toBe(inicial)
    expect(slider('Espaçamento').value).toEqual([35])
    await agir(() => slider('Espaçamento').onValueCommit([35]))
    expect(metadadoDeGrade(camada('d0'))!.espacamento).toBe(35)
    const gesto1 = json(ctx().design)

    await agir(() => slider('Espaçamento').onValueChange([60]))
    await agir(() => slider('Espaçamento').onValueCommit([60]))
    expect(metadadoDeGrade(camada('d0'))!.espacamento).toBe(60)
    const gesto2 = json(ctx().design)
    expect(conferirGrade(ctx().design.layers)).toEqual([])

    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(gesto1)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
    await agir(() => ctx().redo())
    await agir(() => ctx().redo())
    expect(json(ctx().design)).toBe(gesto2)
    expect(slider('Espaçamento').value).toEqual([60])
  })

  it('cantos, tamanho (largura/altura confirmadas ao sair do campo) e trocar layout pela barra', async () => {
    await abrir(design(doisPorDois([A, B, C, A])))
    await selecionar(GRADE)
    await agir(() => slider('Cantos').onValueCommit([40]))
    expect(GRADE.map((id) => camada(id).style!.border!.radius)).toEqual([40, 40, 40, 40])

    await agir(() => (rotulado('Largura da grade').props.onBlur as (e: unknown) => void)({ target: { value: '800' } }))
    expect(metadadoDeGrade(camada('d0'))!.caixa).toEqual({ x: 0, y: 0, w: 800, h: 1350 })
    await agir(() => (rotulado('Altura da grade').props.onBlur as (e: unknown) => void)({ target: { value: '1000' } }))
    expect(metadadoDeGrade(camada('d0'))!.caixa).toEqual({ x: 0, y: 0, w: 800, h: 1000 })
    expect(conferirGrade(ctx().design.layers)).toEqual([])

    // os 14 da pesquisa + as 2 quadradas do Q1
    expect(nos().filter((n) => typeof n.props?.['aria-label'] === 'string' && (n.props['aria-label'] as string).startsWith('Layout '))).toHaveLength(16)
    await agir(() => (rotulado('Layout 2 colunas').props.onClick as () => void)())
    expect(ctx().selectedLayerIds).toEqual(['d2', 'd3'])
    expect(ctx().design.layers.map((l) => l.fileUrl).filter(Boolean)).toHaveLength(4)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })

  it('desvincular pela barra: grade e groupId saem de todas as células, fotos ficam, a barra some', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await selecionar(GRADE)
    await agir(() => (rotulado('Desvincular da grade').props.onClick as () => void)())
    expect(ctx().design.layers.every((l) => l.metadata?.grade === undefined && l.metadata?.groupId === undefined)).toBe(true)
    expect(camada('d0').fileUrl).toBe(A)
    expect(achar((n) => n.props?.['data-barra'] === 'grade')).toBeUndefined()
  })
})

describe('G3 · toolbar da imagem: célula vinculada × foto avulsa', () => {
  it('célula: sem Quadrado 1:1, Ajustar à página e Máscara (motivo escrito); mantém recortar, flips e desvincular', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await selecionar(['d0'])
    const titulos = nos().map((n) => n.props?.title)
    expect(titulos).not.toContain('Ajustar à página (cobre o canvas inteiro)')
    expect(titulos).not.toContain('Máscara de forma')
    expect(achar((n) => n.props?.['aria-label'] === 'Quadrado 1:1')).toBeUndefined()
    expect(titulos).toContain('Espelhar horizontalmente')
    expect(titulos).toContain('Espelhar verticalmente')
    expect(titulos.some((t) => typeof t === 'string' && t.startsWith('Reenquadrar'))).toBe(true)
    expect(achar((n) => n.props?.['data-motivo'] === 'celula-da-grade')?.props.title).toMatch(/máscara.*ajustar à página/i)
    await agir(() => (rotulado('Desvincular da grade').props.onClick as () => void)())
    expect(camada('d0').metadata?.grade).toBeUndefined()
  })

  it('foto avulsa: toolbar como antes (Ajustar à página, Máscara, Quadrado 1:1), sem desvincular', async () => {
    await abrir(design([avulsa]))
    await selecionar(['foto'])
    const titulos = nos().map((n) => n.props?.title)
    expect(titulos).toContain('Ajustar à página (cobre o canvas inteiro)')
    expect(titulos).toContain('Máscara de forma')
    expect(rotulado('Quadrado 1:1')).toBeTruthy()
    expect(achar((n) => n.props?.['aria-label'] === 'Desvincular da grade')).toBeUndefined()
  })
})

describe('G3 · Transformer pela seleção', () => {
  const props = () => h.transformer.props as { enabledAnchors: string[]; rotateEnabled: boolean }
  it('grade inteira: alças de tamanho e SEM girar; célula, subconjunto ou seleção mista: sem alças e sem girar; foto avulsa como antes', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto, avulsa]))
    await selecionar(GRADE)
    expect(props()).toMatchObject({ enabledAnchors: TODAS_AS_ANCORAS, rotateEnabled: false })
    for (const sel of [['d1'], ['d0', 'd3'], [...GRADE, 'titulo']]) {
      await selecionar(sel)
      expect(props()).toMatchObject({ enabledAnchors: [], rotateEnabled: false })
    }
    await selecionar(['foto'])
    expect(props()).toMatchObject({ enabledAnchors: TODAS_AS_ANCORAS, rotateEnabled: true })
  })

  it('soltar a alça da grade inteira: nós do Konva voltam na hora (escala 1, lugar antigo) e a grade é refeita UMA vez pela caixa nova', async () => {
    await abrir(design(doisPorDois([A, B, '', ''])))
    await selecionar(GRADE)
    const inicial = json(ctx().design)
    const lugarAntigo = GRADE.map((id) => ({ ...camada(id).position }))
    expect(h.transformer.nos).toHaveLength(4)
    // o Konva escalou tudo pela metade a partir de (100, 50)
    for (const id of GRADE) {
      const n = nosDoStage.get(id)!
      const l = camada(id)
      n.scaleX(0.5)
      n.scaleY(0.5)
      n.position({ x: 100 + l.position.x / 2, y: 50 + l.position.y / 2 })
    }
    await agir(() => h.transformer.eventos.get('transformend.grade')!())
    // o host não tem react-konva: o que se vê nos nós é só o que o handler devolveu
    expect(GRADE.map((id) => [nosDoStage.get(id)!.scaleX(), nosDoStage.get(id)!.scaleY(), { x: nosDoStage.get(id)!.x(), y: nosDoStage.get(id)!.y() }])).toEqual(
      lugarAntigo.map((p) => [1, 1, p]),
    )
    expect(metadadoDeGrade(camada('d0'))!.caixa).toEqual({ x: 100, y: 50, w: 540, h: 675 })
    expect(metadadoDeGrade(camada('d0'))!.espacamento).toBe(10)
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, B, '', ''])
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
  })

  it('caixa pequena demais: recusa com motivo, design intacto e nós do Konva restaurados', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await selecionar(GRADE)
    const antes = json(ctx().design)
    for (const id of GRADE) {
      nosDoStage.get(id)!.scaleX(0.01)
      nosDoStage.get(id)!.scaleY(0.01)
      nosDoStage.get(id)!.position({ x: 7, y: 7 })
    }
    await agir(() => h.transformer.eventos.get('transformend.grade')!())
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(GRADE.map((id) => [nosDoStage.get(id)!.scaleX(), nosDoStage.get(id)!.scaleY(), nosDoStage.get(id)!.x(), nosDoStage.get(id)!.y()])).toEqual(
      GRADE.map((id) => [1, 1, camada(id).position.x, camada(id).position.y]),
    )
    expect(h.toasts.at(-1)).toMatchObject({ variant: 'destructive', description: expect.stringMatching(/8 px/) })
  })
})

describe('Q2 · Transformer na grade quadrada com margem: a caixa sofre a MESMA afim dos nós', () => {
  type Layout = '4x7-quadrada' | '4x5-quadrada'
  const idsQ = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`)
  function quadrada(layout: Layout, caixa: { x: number; y: number; w: number; h: number }, espacamento: number) {
    const g = criarGrade({ layout, caixa, espacamento, idDaGrade: 'gq', idsDasCelulas: idsQ(layout === '4x7-quadrada' ? 28 : 20) })
    if (!g.ok) throw new Error(JSON.stringify(g.diagnosticos))
    return g.valor
  }
  /** O que o Konva faz no gesto: âncora + escala × (posição − âncora) em todos os nós, mais um deslocamento */
  function transformar(ids: string[], ancora: { x: number; y: number }, sx: number, sy: number, dx = 0, dy = 0) {
    for (const id of ids) {
      const n = nosDoStage.get(id)!
      const l = camada(id)
      n.scaleX(sx)
      n.scaleY(sy)
      n.position({ x: ancora.x + sx * (l.position.x - ancora.x) + dx, y: ancora.y + sy * (l.position.y - ancora.y) + dy })
    }
  }
  const soltar = () => agir(() => h.transformer.eventos.get('transformend.grade')!())

  it.each([
    ['Story 4×7, calha 0: células em y 15, caixa em y 0', '4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 0, 28, { x: 0, y: 15 }],
    ['Feed 4×5, calha 10: células em x 1, caixa em x 0', '4x5-quadrada', { x: 0, y: 0, w: 1080, h: 1350 }, 10, 20, { x: 1, y: 0 }],
  ] as const)('identidade (%s): soltar sem mexer não muda nada nem cria desfazer', async (_n, layout, caixa, g, n, primeira) => {
    await abrir(design(quadrada(layout, caixa, g)))
    await selecionar(idsQ(n))
    expect(h.transformer.nos).toHaveLength(n)
    expect(camada('q0').position).toEqual(primeira)
    const antes = json(ctx().design)
    transformar(idsQ(n), primeira, 1, 1)
    await soltar()
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(metadadoDeGrade(camada('q0'))!.caixa).toEqual(caixa)
    expect(camada('q0').position).toEqual(primeira)
  })

  it('translação (Feed 4×5, calha 10, margem lateral de 1, caixa em (40, 60)): a caixa anda o mesmo delta, sem deriva', async () => {
    await abrir(design(quadrada('4x5-quadrada', { x: 40, y: 60, w: 1080, h: 1350 }, 10)))
    await selecionar(idsQ(20))
    expect(camada('q0').position).toEqual({ x: 41, y: 60 })
    transformar(idsQ(20), { x: 41, y: 60 }, 1, 1, 25, -10)
    await soltar()
    expect(metadadoDeGrade(camada('q0'))!.caixa).toEqual({ x: 65, y: 50, w: 1080, h: 1350 })
    expect(camada('q0').position).toEqual({ x: 66, y: 50 })
    // última: coluna 3, linha 4 ⇒ 65 + 1 + 3 × 272, 50 + 4 × 272
    expect(camada('q19').position).toEqual({ x: 882, y: 1138 })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await agir(() => ctx().undo())
    expect(metadadoDeGrade(camada('q0'))!.caixa).toEqual({ x: 40, y: 60, w: 1080, h: 1350 })
    expect(ctx().canUndo).toBe(false)
  })

  it('escala NÃO uniforme com caixa deslocada (Story 4×7 em (20, 30), 0,5 × 0,75 a partir do canto dos nós): quadrados contidos', async () => {
    await abrir(design(quadrada('4x7-quadrada', { x: 20, y: 30, w: 1080, h: 1920 }, 0)))
    await selecionar(idsQ(28))
    // os nós começam em (20, 45): a margem de 15 fica fora deles e escala junto ⇒ caixa em 45 + 0,75 × (30 − 45) = 33,75
    transformar(idsQ(28), { x: 20, y: 45 }, 0.5, 0.75)
    await soltar()
    const caixa = { x: 20, y: 34, w: 540, h: 1440 }
    expect(metadadoDeGrade(camada('q0'))!.caixa).toEqual(caixa)
    // s = min(540/4, 1440/7) = 135; GH = 945 ⇒ margem vertical (1440 − 945)/2 = 247,5
    expect(camada('q0').position).toEqual({ x: 20, y: 281.5 })
    for (const id of idsQ(28)) {
      const l = camada(id)
      expect(l.size).toEqual({ width: 135, height: 135 })
      const dentro = l.position.x >= caixa.x && l.position.y >= caixa.y && l.position.x + 135 <= caixa.x + caixa.w && l.position.y + 135 <= caixa.y + caixa.h
      expect(dentro, id).toBe(true)
    }
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect(idsQ(28).every((id) => nosDoStage.get(id)!.scaleX() === 1 && nosDoStage.get(id)!.scaleY() === 1)).toBe(true)
  })
})
