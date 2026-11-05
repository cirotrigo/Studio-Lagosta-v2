/**
 * G3 · ajustes pelo PROVIDER e pelos HOOKS reais: `QueryClientProvider`, `MultiPageProvider` e `TemplateEditorProvider`
 * reais no host sem DOM do G1, `useAjustarGrade` e `useArrasteDaGrade` reais. Dublês: só `use-pages`, o toast e o
 * medidor da foto (injetado); no arraste, os nós e o stage do Konva são objetos simples (x/y/escala), não o Konva.
 * Prova: um applyDesign = um desfazer, refazer, recusa sem histórico, alvo conferido DENTRO do updater depois da espera.
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider, useMultiPage } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { useAjustarGrade, useArrasteDaGrade } from '@/hooks/use-ajustar-grade'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { criarGrade, preencherCelula, type MudancaDeGrade } from '../operacoes'
import type { DesfechoDoAjuste } from '../ajustes'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const C = `${BLOB}/fotos/c.jpg`
const NAT = { width: 1600, height: 1200 }
const GRADE = ['d0', 'd1', 'd2', 'd3']
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const design = (layers: Layer[], canvas = { width: 1080, height: 1350 }): DesignData =>
  ({ canvas: { ...canvas, backgroundColor: '#ffffff' }, layers: layers.map((l, i) => ({ ...l, order: 10 * i + 3 })) }) as DesignData
const pagina = (id: string, d: DesignData) => ({ id, name: id, width: d.canvas.width, height: d.canvas.height, layers: d.layers, order: 0 }) as unknown as Page
const json = (d: DesignData) => JSON.stringify(d)

// ── Medidor (injetado no hook) ──────────────────────────────────────────────
// `ativas`/`pico`: quantas medidas estão em voo ao mesmo tempo (Q2: a fila deixa no máximo 2); `falhar`: a foto não carrega
const medidor = { medidas: [] as string[], segurar: false, presas: [] as Array<() => void>, outraUrl: new Map<string, string>(), falhar: new Set<string>(), ativas: 0, pico: 0 }
const medirFoto = async (url: string) => {
  medidor.medidas.push(url)
  medidor.ativas++
  medidor.pico = Math.max(medidor.pico, medidor.ativas)
  try {
    if (medidor.segurar) await new Promise<void>((r) => medidor.presas.push(r))
    if (medidor.falhar.has(url)) throw new Error('A foto não carregou.')
    // `outraUrl`: a corrida do use-image entrega a foto de OUTRA URL
    return { src: medidor.outraUrl.get(url) ?? url, ...NAT }
  } finally {
    medidor.ativas--
  }
}

// ── Montagem ────────────────────────────────────────────────────────────────
const sonda: {
  ctx: TemplateEditorContextValue | null
  paginas: ReturnType<typeof useMultiPage> | null
  ajuste: ReturnType<typeof useAjustarGrade> | null
  arraste: ReturnType<typeof useArrasteDaGrade> | null
} = { ctx: null, paginas: null, ajuste: null, arraste: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  sonda.paginas = useMultiPage()
  sonda.ajuste = useAjustarGrade({ medirFoto })
  sonda.arraste = useArrasteDaGrade()
  return null
}
const ctx = () => sonda.ctx!
const camada = (id: string) => ctx().design.layers.find((l) => l.id === id)!
let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData, outra?: DesignData) {
  h.paginas = { data: [pagina('p1', d), pagina('p2', outra ?? d)], isLoading: false, refetch: () => undefined }
  const t: TemplateResource = { id: 1, name: 'T1', type: 'FEED', dimensions: `${d.canvas.width}x${d.canvas.height}`, designData: d, dynamicFields: [], projectId: 5 }
  const m = await montar(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(
        MultiPageProvider,
        { templateId: 1, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
        React.createElement(TemplateEditorProvider, { template: t } as React.ComponentProps<typeof TemplateEditorProvider>, React.createElement(Sonda)),
      ),
    ),
  )
  desmontar = m.desmontar
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  h.toasts.length = 0
  medidor.medidas = []
  medidor.segurar = false
  medidor.presas = []
  medidor.outraUrl.clear()
  medidor.falhar.clear()
  medidor.ativas = 0
  medidor.pico = 0
})
const correr = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}
const agir = (f: () => unknown) =>
  emAct(async () => {
    f()
    await correr()
  })
const selecionar = (ids: string[]) => agir(() => ctx().selectLayers(ids))

/**
 * Começa o ajuste (o hook planeja e mede) e devolve a promessa do desfecho DENTRO de um objeto: devolvida direto, a
 * função async a adotaria e o `await` esperaria a medida presa (deadlock do teste, o mesmo registrado no G2).
 */
async function comecar(gradeId: string, mudanca: MudancaDeGrade) {
  let p!: Promise<DesfechoDoAjuste>
  await emAct(async () => {
    p = sonda.ajuste!.ajustar(gradeId, mudanca)
    await correr()
  })
  return { p }
}
async function ajustar(gradeId: string, mudanca: MudancaDeGrade) {
  const { p } = await comecar(gradeId, mudanca)
  await emAct(correr)
  return p
}
const soltarMedidas = () =>
  emAct(async () => {
    for (const r of medidor.presas.splice(0)) r()
    await correr()
  })

describe('G3 · ajustes pelo hook e pelo provider reais', () => {
  it('espaçamento e depois cantos: cada URL medida uma vez, UM desfazer por ajuste, refazer devolve os mesmos estados', async () => {
    await abrir(design([...doisPorDois([A, B, A, '']), texto]))
    await selecionar(GRADE)
    const inicial = json(ctx().design)
    expect(await ajustar('g2', { espacamento: 30 })).toMatchObject({ ok: true })
    expect([...medidor.medidas].sort()).toEqual([A, B])
    expect(metadadoDeGrade(camada('d0'))!.espacamento).toBe(30)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    const depois1 = json(ctx().design)
    expect(await ajustar('g2', { raio: 24 })).toMatchObject({ ok: true })
    const depois2 = json(ctx().design)
    expect(GRADE.map((id) => camada(id).style!.border!.radius)).toEqual([24, 24, 24, 24])

    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(depois1)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
    await agir(() => ctx().redo())
    expect(json(ctx().design)).toBe(depois1)
    await agir(() => ctx().redo())
    expect(json(ctx().design)).toBe(depois2)
    expect(ctx().selectedLayerIds).toEqual(GRADE)
  })

  it('Story: redimensionar a caixa refaz todas as células uma vez, fotos nas mesmas células, um desfazer', async () => {
    const g = criarGrade({ layout: '2-1-2', caixa: { x: 0, y: 0, w: 1080, h: 1920 }, idDaGrade: 'gs', idsDasCelulas: ['s0', 's1', 's2', 's3', 's4'] })
    if (!g.ok) throw new Error('fixture')
    const cheias = g.valor.map((c, i) => (i < 2 ? (preencherCelula(c, [A, B][i]) as { valor: Layer }).valor : c))
    await abrir(design(cheias, { width: 1080, height: 1920 }))
    const inicial = json(ctx().design)
    expect(await ajustar('gs', { caixa: { x: 40, y: 100, w: 1000, h: 1700 } })).toMatchObject({ ok: true })
    expect(metadadoDeGrade(camada('s2'))!.caixa).toEqual({ x: 40, y: 100, w: 1000, h: 1700 })
    expect(['s0', 's1', 's2'].map((id) => camada(id).fileUrl)).toEqual([A, B, ''])
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
  })

  it('medida que volta com OUTRA URL (corrida do use-image): FOTO_SEM_MEDIDA, nada aplicado, sem histórico nem dirty, motivo no aviso', async () => {
    await abrir(design(doisPorDois([A, B, '', ''])))
    medidor.outraUrl.set(B, C)
    const antes = json(ctx().design)
    expect(await ajustar('g2', { espacamento: 40 })).toMatchObject({ ok: false, codigo: 'FOTO_SEM_MEDIDA' })
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(ctx().dirty).toBe(false)
    expect(h.toasts.at(-1)).toMatchObject({ variant: 'destructive', description: expect.stringMatching(/medir/i) })
  })

  it('layout menor: sobras saem avulsas e selecionadas, com aviso; UM desfazer volta a grade inteira', async () => {
    await abrir(design([...doisPorDois([A, B, C, A]), texto]))
    const inicial = json(ctx().design)
    expect(await ajustar('g2', { layout: '2-colunas' })).toMatchObject({ ok: true, selecionar: ['d2', 'd3'] })
    expect(ctx().selectedLayerIds).toEqual(['d2', 'd3'])
    expect(camada('d2').metadata?.grade).toBeUndefined()
    expect(h.toasts.at(-1)?.description).toMatch(/2 fotos/)
    expect(ctx().design.layers.map((l) => l.fileUrl).filter(Boolean)).toHaveLength(4)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
  })

  const editar = (id: string, f: (l: Layer) => Layer) => ctx().updateLayer(id, f)
  it.each([
    ['célula recortada', () => editar('d1', (l) => ({ ...l, style: { ...l.style, crop: { x: 0.1, y: 0, width: 0.5, height: 0.6 } } })), true],
    ['grade removida', () => GRADE.forEach((id) => ctx().removeLayer(id)), false],
    [
      'navegou para outra página',
      () => {
        sonda.paginas!.setCurrentPageId('p2')
        ctx().loadTemplate({ designData: design([texto]), markDirty: false, historyKey: 'p2' })
      },
      false,
    ],
    ['ida e volta à MESMA página (carga nova)', () => ctx().loadTemplate({ designData: design(doisPorDois([A, B, '', ''])), markDirty: false, historyKey: 'p1' }), false],
  ] as const)('%s DURANTE a medida: o ajuste não se aplica e a edição concorrente fica', async (_nome, durante, desfaz) => {
    await abrir(design(doisPorDois([A, B, '', ''])))
    const inicial = json(ctx().design)
    medidor.segurar = true
    const { p } = await comecar('g2', { espacamento: 50 })
    expect(sonda.ajuste!.emVoo).toBe(true)
    await agir(durante)
    const concorrente = json(ctx().design)
    await soltarMedidas()
    expect(await p).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(json(ctx().design)).toBe(concorrente)
    expect(sonda.ajuste!.emVoo).toBe(false)
    if (desfaz) {
      // UM desfazer tira só a edição concorrente: o ajuste recusado não deixou entrada
      await agir(() => ctx().undo())
      expect(json(ctx().design)).toBe(inicial)
      expect(ctx().canUndo).toBe(false)
    }
  })

  it('edição de OUTRA camada durante a medida não impede: o ajuste entra e o texto editado fica', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    medidor.segurar = true
    const { p } = await comecar('g2', { espacamento: 50 })
    await agir(() => editar('titulo', (l) => ({ ...l, content: 'Novo' })))
    await soltarMedidas()
    expect(await p).toMatchObject({ ok: true })
    expect(camada('titulo').content).toBe('Novo')
    expect(metadadoDeGrade(camada('d0'))!.espacamento).toBe(50)
  })

  it('segundo pedido com o primeiro em voo: recusado (EM_ANDAMENTO), sem medir de novo', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    medidor.segurar = true
    const { p: p1 } = await comecar('g2', { espacamento: 20 })
    const { p: p2 } = await comecar('g2', { espacamento: 60 })
    expect(await p2).toMatchObject({ ok: false, codigo: 'EM_ANDAMENTO' })
    expect(medidor.medidas).toEqual([A])
    await soltarMedidas()
    expect(await p1).toMatchObject({ ok: true })
  })
})

describe('G3 · mover, desvincular e alinhar pelo contexto', () => {
  it('moverSelecao: grade inteira + texto num applyDesign; desfazer e refazer', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    const inicial = json(ctx().design)
    // a promessa resolve no updater: aguardada FORA do act
    let r!: Promise<DesfechoDoAjuste>
    await agir(() => {
      r = ctx().moverSelecao(['d3', 'titulo'], 20, 30)
    })
    expect(await r).toMatchObject({ ok: true })
    expect(camada('d0').position).toEqual({ x: 20, y: 30 })
    expect(camada('titulo').position).toEqual({ x: 30, y: 40 })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    const depois = json(ctx().design)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
    await agir(() => ctx().redo())
    expect(json(ctx().design)).toBe(depois)
  })

  it('desvincular: um desfazer, fotos e recortes intactos; refazer', async () => {
    await abrir(design(doisPorDois([A, B, '', ''])))
    await selecionar(['d0'])
    const inicial = json(ctx().design)
    await agir(() => ctx().desvincularGrade('g2'))
    expect(ctx().design.layers.every((l) => l.metadata?.grade === undefined && l.metadata?.groupId === undefined)).toBe(true)
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, B, '', ''])
    expect(ctx().selectedLayerIds).toEqual(['d0'])
    const depois = json(ctx().design)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    await agir(() => ctx().redo())
    expect(json(ctx().design)).toBe(depois)
  })

  it('alinhar e distribuir com célula de grade na seleção: bloqueado com motivo, nada muda', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    await selecionar([...GRADE, 'titulo'])
    const antes = json(ctx().design)
    await agir(() => ctx().alignSelectedLeft())
    await agir(() => ctx().distributeSelectedH())
    expect(json(ctx().design)).toBe(antes)
    expect(h.toasts.map((t) => t.description)).toEqual([expect.stringMatching(/grade/i), expect.stringMatching(/grade/i)])
  })
})

// ── Arraste: nós e stage simples (posição e escala), como o Konva os entrega ao stage ──
type NoFalso = { id: () => string; x: () => number; y: () => number; position: (p?: { x: number; y: number }) => { x: number; y: number }; isDragging: () => boolean }
function palco(layers: Layer[]) {
  const nos = new Map<string, NoFalso>()
  for (const l of layers) {
    const p = { ...l.position }
    nos.set(l.id, {
      id: () => l.id,
      x: () => p.x,
      y: () => p.y,
      position: (novo) => {
        if (novo) Object.assign(p, novo)
        return { ...p }
      },
      isDragging: () => true,
    })
  }
  return { nos, stage: { findOne: (sel: string) => nos.get(sel.slice(1)) } }
}

describe('G3 · arraste da grade (useArrasteDaGrade real)', () => {
  it('posição gravada pelo factory é consumida; célula arrastada leva as irmãs; soltar do primário + proxies move UMA vez (um desfazer)', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    await selecionar(GRADE)
    const inicial = json(ctx().design)
    const { nos, stage } = palco(ctx().design.layers)
    const arraste = () => sonda.arraste!
    expect(arraste().consumirGeometria('d1', { position: { x: 1, y: 2 } })).toBe(true)
    expect(arraste().consumirGeometria('titulo', { position: { x: 1, y: 2 } })).toBe(false)

    nos.get('d1')!.position({ x: 545 + 30.25, y: 20 })
    arraste().acompanhar(camada('d1'), nos.get('d1')!, stage)
    expect(nos.get('d0')!.position()).toEqual({ x: 30.25, y: 20 })
    expect(nos.get('d3')!.position()).toEqual({ x: 545 + 30.25, y: 700 })
    expect(nos.get('titulo')!.position()).toEqual({ x: 10, y: 10 })

    await agir(() => {
      for (const id of ['d1', 'd0', 'd2', 'd3']) expect(arraste().soltar(camada(id), stage)).toBe(true)
    })
    expect(camada('d0').position).toEqual({ x: 30, y: 20 })
    expect(metadadoDeGrade(camada('d3'))!.caixa).toEqual({ x: 30, y: 20, w: 1080, h: 1350 })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
  })

  it('arraste recusado (célula travada): nada gravado, nós do Konva DEVOLVIDOS ao lugar, motivo no aviso', async () => {
    const [d0, ...resto] = doisPorDois([A, '', '', ''])
    await abrir(design([{ ...d0, locked: true }, ...resto]))
    await selecionar(['d2'])
    const antes = json(ctx().design)
    const { nos, stage } = palco(ctx().design.layers)
    nos.get('d2')!.position({ x: 50, y: 700 })
    sonda.arraste!.acompanhar(camada('d2'), nos.get('d2')!, stage)
    expect(nos.get('d0')!.position()).toEqual({ x: 50, y: 20 })
    await agir(() => sonda.arraste!.soltar(camada('d2'), stage))
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(GRADE.map((id) => nos.get(id)!.position())).toEqual(GRADE.map((id) => camada(id).position))
    expect(h.toasts.at(-1)).toMatchObject({ variant: 'destructive', description: expect.stringMatching(/travada/i) })
  })

  it('arraste sem grade segue o caminho de sempre (nada consumido)', async () => {
    await abrir(design([texto]))
    await selecionar(['titulo'])
    const { stage } = palco(ctx().design.layers)
    expect(sonda.arraste!.consumirGeometria('titulo', { position: { x: 1, y: 1 } })).toBe(false)
    expect(sonda.arraste!.soltar(camada('titulo'), stage)).toBe(false)
  })
})

describe('Q2 · grades quadradas de 28/20 fotos pelo hook e pelo provider reais', () => {
  const FOTOS = Array.from({ length: 28 }, (_, i) => `${BLOB}/fotos/q${i}.jpg`)
  const IDS = Array.from({ length: 28 }, (_, i) => `q${i}`)
  const STORY = { width: 1080, height: 1920 }
  function cheia(layout: '4x7-quadrada' | '4x5-quadrada', caixa: { x: number; y: number; w: number; h: number }, n: number) {
    const g = criarGrade({ layout, caixa, idDaGrade: 'gq', idsDasCelulas: IDS.slice(0, n) })
    if (!g.ok) throw new Error(JSON.stringify(g.diagnosticos))
    return g.valor.map((c, i) => (preencherCelula(c, FOTOS[i]) as { valor: Layer }).valor)
  }
  const membros = () => ctx().design.layers.filter((l) => metadadoDeGrade(l)?.id === 'gq')
  const quadradosDentro = (caixa: { x: number; y: number; w: number; h: number }) =>
    membros().every(
      (l) =>
        l.size.width === l.size.height &&
        l.position.x >= caixa.x - 1e-9 &&
        l.position.y >= caixa.y - 1e-9 &&
        l.position.x + l.size.width <= caixa.x + caixa.w + 1e-9 &&
        l.position.y + l.size.height <= caixa.y + caixa.h + 1e-9,
    )
  const soltarUma = () =>
    emAct(async () => {
      medidor.presas.shift()?.()
      await correr()
    })

  it('28 fotos: a medida anda em fila (no máximo 2 em voo), cada URL uma vez; espaçamento 0→10 num desfazer', async () => {
    await abrir(design(cheia('4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 28), STORY))
    const inicial = json(ctx().design)
    medidor.segurar = true
    const { p } = await comecar('gq', { espacamento: 10 })
    expect(medidor.medidas).toHaveLength(2)
    while (medidor.presas.length) {
      await soltarUma()
      expect(medidor.ativas).toBeLessThanOrEqual(2)
    }
    expect(await p).toMatchObject({ ok: true })
    expect(medidor.pico).toBe(2)
    expect([...medidor.medidas].sort()).toEqual([...FOTOS].sort())
    expect([camada('q0').position, camada('q0').size]).toEqual([{ x: 0, y: 11.25 }, { width: 262.5, height: 262.5 }])
    expect(quadradosDentro({ x: 0, y: 0, w: 1080, h: 1920 })).toBe(true)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
  })

  it('cancelar durante a espera da fila: nenhuma medida nova começa; nada aplicado, sem histórico', async () => {
    await abrir(design(cheia('4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 28), STORY))
    const antes = json(ctx().design)
    medidor.segurar = true
    const { p } = await comecar('gq', { espacamento: 10 })
    expect(medidor.medidas).toHaveLength(2)
    await agir(() => sonda.ajuste!.cancelar())
    await soltarMedidas()
    expect(await p).toMatchObject({ ok: false, codigo: 'CANCELADO' })
    expect(medidor.medidas).toHaveLength(2)
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(sonda.ajuste!.emVoo).toBe(false)
  })

  it('entre 28, uma volta com OUTRA URL e outra falha: FOTO_SEM_MEDIDA, nada aplicado; a fila não trava (todas medidas)', async () => {
    await abrir(design(cheia('4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 28), STORY))
    medidor.outraUrl.set(FOTOS[3], C)
    medidor.falhar.add(FOTOS[17])
    const antes = json(ctx().design)
    expect(await ajustar('gq', { espacamento: 10 })).toMatchObject({ ok: false, codigo: 'FOTO_SEM_MEDIDA' })
    expect(medidor.medidas).toHaveLength(28)
    expect(medidor.pico).toBeLessThanOrEqual(2)
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('recorte numa célula DURANTE a fila: ALVO_MUDOU dentro do updater e o recorte do usuário fica', async () => {
    await abrir(design(cheia('4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 28), STORY))
    medidor.segurar = true
    const { p } = await comecar('gq', { espacamento: 10 })
    await agir(() => ctx().updateLayer('q5', (l) => ({ ...l, style: { ...l.style, crop: { x: 0.1, y: 0, width: 0.75, height: 1 } } })))
    const concorrente = json(ctx().design)
    while (medidor.presas.length) await soltarUma()
    expect(await p).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(json(ctx().design)).toBe(concorrente)
  })

  it('28 → 20 (Story 4×7 → 4×5 na mesma caixa): 8 fotos avulsas e selecionadas; desfazer devolve ids e recortes; refazer', async () => {
    const camadas = cheia('4x7-quadrada', { x: 0, y: 0, w: 1080, h: 1920 }, 28)
    // recorte do usuário na q1, quadrado sobre a foto 1600×1200 (0,375 × 1600 = 0,5 × 1200 = 600)
    camadas[1] = { ...camadas[1], style: { ...camadas[1].style, crop: { x: 0.1, y: 0.2, width: 0.375, height: 0.5 } } }
    await abrir(design([...camadas, texto], STORY))
    await selecionar(IDS)
    const inicial = json(ctx().design)
    expect(await ajustar('gq', { layout: '4x5-quadrada' })).toMatchObject({ ok: true, selecionar: IDS.slice(20) })
    expect(ctx().selectedLayerIds).toEqual(IDS.slice(20))
    expect(h.toasts.at(-1)?.description).toMatch(/8 fotos/)
    expect(IDS.slice(20).every((id) => camada(id).metadata?.grade === undefined && camada(id).metadata?.groupId === undefined)).toBe(true)
    // 20 quadrados de 270 centralizados no Story: margem vertical (1920 − 1350)/2 = 285
    expect(membros().map((l) => l.id)).toEqual(IDS.slice(0, 20))
    expect(camada('q0').position).toEqual({ x: 0, y: 285 })
    expect(membros().every((l) => l.size.width === 270 && l.size.height === 270)).toBe(true)
    expect(camada('q1').style!.crop).toEqual({ x: 0.1, y: 0.2, width: 0.375, height: 0.5 })
    expect(ctx().design.layers.map((l) => l.fileUrl).filter(Boolean)).toHaveLength(28)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    const depois = json(ctx().design)
    await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().selectedLayerIds.every((id) => ctx().design.layers.some((l) => l.id === id))).toBe(true)
    await agir(() => ctx().redo())
    expect(json(ctx().design)).toBe(depois)
  })

  it('20 → 28 e depois caixa e espaçamento (Feed): 8 células novas vazias; tudo segue quadrado e contido; três desfazer', async () => {
    await abrir(design([...cheia('4x5-quadrada', { x: 0, y: 0, w: 1080, h: 1350 }, 20), texto]))
    const inicial = json(ctx().design)
    expect(await ajustar('gq', { layout: '4x7-quadrada' })).toMatchObject({ ok: true })
    expect(membros()).toHaveLength(28)
    expect(membros().filter((l) => !l.fileUrl)).toHaveLength(8)
    // s = min(1080/4, 1350/7) = 192,857…: contido pela altura
    expect(camada('q0').size.width).toBeCloseTo(1350 / 7, 9)
    expect(quadradosDentro({ x: 0, y: 0, w: 1080, h: 1350 })).toBe(true)
    const caixa = { x: 30, y: 40, w: 900, h: 1200 }
    expect(await ajustar('gq', { caixa })).toMatchObject({ ok: true })
    expect(quadradosDentro(caixa)).toBe(true)
    expect(await ajustar('gq', { espacamento: 40 })).toMatchObject({ ok: true })
    expect(metadadoDeGrade(camada('q0'))!.espacamento).toBe(40)
    expect(quadradosDentro(caixa)).toBe(true)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    for (let i = 0; i < 3; i++) await agir(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
  })
})
