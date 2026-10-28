/**
 * G1 · inserir grade pelo PROVIDER REAL do editor: `QueryClientProvider` + `MultiPageProvider` + `TemplateEditorProvider`
 * reais, montados no host sem DOM (`suporte/host-sem-dom.ts`). Só o hook de dados das páginas é dublê (sem rede); sem
 * canvas, shell nem autosave. A sonda lê o contexto como qualquer consumidor.
 *
 * O que se compara é o `design` (canvas + camadas): `dirty` e seleção não são DesignData (desfazer marca dirty e filtra
 * a seleção). "Byte a byte" = JSON do design normalizado que o provider carregou.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const paginas = vi.hoisted(() => ({ dados: { data: [] as unknown[], isLoading: false, refetch: () => undefined } }))
vi.mock('@/hooks/use-pages', () => ({
  usePages: () => paginas.dados,
  useUpdatePage: () => ({ mutateAsync: async () => undefined }),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider, useMultiPage } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { armarInsercaoDeClipe, consumirInsercaoDeClipe, desarmarInsercaoDeClipe } from '@/lib/video/insercao-de-clipe'
import type { DesfechoDaInsercao } from '../insercao'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB } from './fixtures'

const FOTO = `${BLOB}/fotos/fundo.jpg`
const NAT = { width: 2672, height: 4000 }
const FEED = { width: 1080, height: 1350 }
const STORY = { width: 1080, height: 1920 }

function camada(id: string, type: Layer['type'], extra: Partial<Layer> = {}): Layer {
  return { id, type, name: id, visible: true, locked: false, order: 0, position: { x: 100, y: 100 }, size: { width: 200, height: 80 }, ...extra } as Layer
}
const fundo = (c: { width: number; height: number }) =>
  camada('bg-foto', 'image', { name: 'Foto de fundo', position: { x: 0, y: 0 }, size: { ...c }, rotation: 0, fileUrl: FOTO, style: { objectFit: 'cover', cropPosition: 'center-middle' } })
const texto = camada('titulo', 'text', { content: 'Oi' })
const logo = camada('logo', 'logo')
// ordem de propósito fora de 0..n: o provider normaliza ao carregar, e é ESSE o estado inicial a restaurar
const design = (c: { width: number; height: number }, layers: Layer[], audio?: DesignData['audio']): DesignData =>
  ({ canvas: { ...c, backgroundColor: '#ffffff' }, layers: layers.map((l, i) => ({ ...l, order: 10 * i + 3 })), ...(audio ? { audio } : {}) }) as DesignData

function pagina(id: string, d: DesignData): Page {
  return { id, name: id, width: d.canvas.width, height: d.canvas.height, layers: d.layers, order: 0, createdAt: '2026-10-27', updatedAt: '2026-10-27' } as unknown as Page
}

const sonda: { ctx: TemplateEditorContextValue | null; paginas: ReturnType<typeof useMultiPage> | null } = { ctx: null, paginas: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  sonda.paginas = useMultiPage()
  return null
}
const ctx = () => sonda.ctx!
const json = (d: DesignData) => JSON.stringify(d)

function recurso(id: number, d: DesignData): TemplateResource {
  return { id, name: `T${id}`, type: 'STORY', dimensions: `${d.canvas.width}x${d.canvas.height}`, designData: d, dynamicFields: [], projectId: 5 }
}
const arvore = (t: TemplateResource) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    React.createElement(
      MultiPageProvider,
      { templateId: 1, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
      React.createElement(TemplateEditorProvider, { template: t } as React.ComponentProps<typeof TemplateEditorProvider>, React.createElement(Sonda)),
    ),
  )

let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData, outra?: DesignData) {
  paginas.dados = { data: [pagina('p1', d), pagina('p2', outra ?? d)], isLoading: false, refetch: () => undefined }
  const m = await montar(arvore(recurso(1, d)))
  desmontar = m.desmontar
  return m
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  desarmarInsercaoDeClipe()
})

/** Medida controlada: o teste decide quando e com qual imagem ela volta */
function medidaPendente() {
  let resolver!: (img: { src: string; width: number; height: number } | undefined) => void
  const chamadas: string[] = []
  const medirFoto = (url: string) => {
    chamadas.push(url)
    return new Promise<{ src: string; width: number; height: number } | undefined>((r) => (resolver = r))
  }
  return { medirFoto, chamadas, responder: (img: { src: string; width: number; height: number } | undefined) => resolver(img) }
}
const medidaPronta = (img = { src: FOTO, ...NAT }) => ({ medirFoto: async () => img })
const deixarCorrer = () => new Promise((r) => setTimeout(r, 0))

async function inserir(layout: string, medir: { medirFoto: (url: string) => Promise<unknown> } = medidaPronta()): Promise<DesfechoDaInsercao> {
  let p!: Promise<DesfechoDaInsercao>
  await emAct(async () => {
    p = ctx().inserirGrade(layout, medir as never)
    await deixarCorrer()
  })
  return p
}

describe('G1 · provider real: inserir = um desfazer', () => {
  for (const [nome, c, n] of [
    ['Feed', FEED, 4],
    ['Story', STORY, 4],
  ] as const) {
    it(`${nome}: N células num applyDesign; Cmd+Z volta ao design normalizado inicial byte a byte; refazer traz as mesmas camadas`, async () => {
      await abrir(design(c, [texto, logo]))
      const inicial = json(ctx().design)
      expect(ctx().canUndo).toBe(false)

      const r = await inserir('2x2')
      expect(r.ok).toBe(true)
      const depois = json(ctx().design)
      const celulas = ctx().design.layers.filter((l) => l.metadata?.grade)
      expect(celulas).toHaveLength(n)
      expect(ctx().design.layers.map((l) => l.id).slice(n)).toEqual(['titulo', 'logo'])
      expect(ctx().design.layers.map((l) => l.order)).toEqual([0, 1, 2, 3, 4, 5])
      expect(conferirGrade(ctx().design.layers)).toEqual([])
      expect(ctx().selectedLayerIds).toEqual(celulas.map((l) => l.id))

      await emAct(() => ctx().undo())
      expect(json(ctx().design)).toBe(inicial)
      expect(ctx().canUndo).toBe(false) // uma entrada só
      expect(ctx().selectedLayerIds).toEqual([])

      await emAct(() => ctx().redo())
      expect(json(ctx().design)).toBe(depois)
    })
  }

  // Q2: as quadradas entram com o espaçamento inicial delas (0) e todas as células de uma vez, num desfazer
  for (const [nome, c, layout, n, primeira] of [
    ['Story', STORY, '4x7-quadrada', 28, { x: 0, y: 15 }],
    ['Feed', FEED, '4x5-quadrada', 20, { x: 0, y: 0 }],
  ] as const) {
    it(`${nome}: ${layout} insere ${n} quadrados 270×270 num applyDesign; Cmd+Z volta byte a byte; refazer`, async () => {
      await abrir(design(c, [texto, logo]))
      const inicial = json(ctx().design)
      expect((await inserir(layout)).ok).toBe(true)
      const depois = json(ctx().design)
      const celulas = ctx().design.layers.filter((l) => l.metadata?.grade)
      expect(celulas).toHaveLength(n)
      expect(celulas[0].position).toEqual(primeira)
      expect(celulas.every((l) => l.size.width === 270 && l.size.height === 270 && metadadoDeGrade(l)?.espacamento === 0)).toBe(true)
      expect(ctx().design.layers.map((l) => l.id).slice(n)).toEqual(['titulo', 'logo'])
      expect(conferirGrade(ctx().design.layers)).toEqual([])
      expect(ctx().selectedLayerIds).toEqual(celulas.map((l) => l.id))
      await emAct(() => ctx().undo())
      expect(json(ctx().design)).toBe(inicial)
      expect(ctx().canUndo).toBe(false)
      await emAct(() => ctx().redo())
      expect(json(ctx().design)).toBe(depois)
    })
  }

  it('fundo → célula 1: remover o bg-foto e inserir as células é UM desfazer', async () => {
    await abrir(design(FEED, [fundo(FEED), texto]))
    const inicial = json(ctx().design)
    const r = await inserir('2-colunas')
    expect(r).toMatchObject({ ok: true, convertida: 'bg-foto' })
    expect(ctx().design.layers.map((l) => l.id)).not.toContain('bg-foto')
    expect(ctx().design.layers[0].fileUrl).toBe(FOTO)
    await emAct(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false)
  })

  it('não consome o "+" armado da linha do tempo e não cria clipe', async () => {
    await abrir(design(FEED, [texto]))
    armarInsercaoDeClipe()
    const r = await inserir('3x2')
    expect(r.ok).toBe(true)
    const celulas = ctx().design.layers.filter((l) => (l.metadata?.grade as { layout?: string } | undefined)?.layout === '3x2')
    expect(celulas.map((l) => l.id)).toEqual(r.celulas)
    expect(celulas).toHaveLength(6)
    expect(ctx().design.layers.some((l) => (l as { clipe?: unknown }).clipe)).toBe(false)
    expect(consumirInsercaoDeClipe()).toBe(true)
  })

  it.each([
    // a música chega pelo `loadTemplate` do PageSync (o estado inicial do provider guarda só canvas e camadas)
    ['música', [fundo(FEED), texto], { source: 'library', musicId: 9, startTime: 0, endTime: 12 }],
    ['vídeo visível', [fundo(FEED), camada('v', 'video', { fileUrl: `${BLOB}/v.mp4` }), texto], undefined],
  ] as const)('página de vídeo (%s): recusa com motivo, sem medir, sem tocar design, histórico ou dirty', async (_n, layers, audio) => {
    const d = design(FEED, layers as unknown as Layer[], audio as DesignData['audio'])
    await abrir(d)
    await emAct(() => ctx().loadTemplate({ designData: d, markDirty: false, historyKey: 'p1' }))
    const antes = ctx().design
    const m = medidaPendente()
    const r = await inserir('2x2', m)
    expect(r).toMatchObject({ ok: false, codigo: 'PAGINA_DE_VIDEO' })
    expect(m.chamadas).toEqual([])
    expect(ctx().design).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(ctx().dirty).toBe(false)
  })
})

describe('G1 · provider real: medida assíncrona confere o alvo DENTRO do applyDesign', () => {
  it('medida com a URL exata: converte depois que a foto volta', async () => {
    await abrir(design(FEED, [fundo(FEED), texto]))
    const m = medidaPendente()
    let p!: Promise<DesfechoDaInsercao>
    await emAct(() => {
      p = ctx().inserirGrade('2x2', m as never)
    })
    expect(m.chamadas).toEqual([FOTO])
    expect(ctx().canUndo).toBe(false) // nada aplicado antes da medida
    await emAct(async () => {
      m.responder({ src: FOTO, ...NAT })
      await deixarCorrer()
    })
    expect(await p).toMatchObject({ ok: true, convertida: 'bg-foto' })
  })

  it('imagem de OUTRA URL (corrida do carregamento): sem medida ⇒ fundo intacto, grade vazia e aviso', async () => {
    await abrir(design(FEED, [fundo(FEED), texto]))
    const r = await inserir('2x2', medidaPronta({ src: `${BLOB}/fotos/outra.jpg`, ...NAT }))
    expect(r).toMatchObject({ ok: true, aviso: { motivo: 'SEM_MEDIDA' } })
    expect(ctx().design.layers.map((l) => l.id)[0]).toBe('bg-foto')
    expect(ctx().design.layers.find((l) => l.id === 'bg-foto')?.fileUrl).toBe(FOTO)
  })

  async function comMedidaPendente(d: DesignData, outra: DesignData | undefined, durante: () => void | Promise<void>) {
    await abrir(d, outra)
    const m = medidaPendente()
    let p!: Promise<DesfechoDaInsercao>
    await emAct(() => {
      p = ctx().inserirGrade('2x2', m as never)
    })
    await emAct(durante)
    const antes = json(ctx().design)
    const pilha = ctx().canUndo
    await emAct(async () => {
      m.responder({ src: FOTO, ...NAT })
      await deixarCorrer()
    })
    return { r: await p, antes, pilha }
  }

  it('troca de página durante a medida (PageSync carrega a outra): resultado atrasado NÃO é aplicado', async () => {
    const p2 = design(FEED, [fundo(FEED), camada('outro', 'text')])
    const { r, antes, pilha } = await comMedidaPendente(design(FEED, [fundo(FEED), texto]), p2, () => {
      sonda.paginas!.setCurrentPageId('p2')
      ctx().loadTemplate({ designData: p2, markDirty: false, historyKey: 'p2' })
    })
    expect(r).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(pilha)
  })

  it('ida e volta à MESMA página durante a medida (mesmo pageId, carga nova): não aplica', async () => {
    const d = design(FEED, [fundo(FEED), texto])
    const { r, antes } = await comMedidaPendente(d, undefined, () => {
      ctx().loadTemplate({ designData: d, markDirty: false, historyKey: 'p1' })
    })
    expect(r).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(json(ctx().design)).toBe(antes)
  })

  it('recorte do fundo alterado durante a medida: não aplica e a edição do usuário fica', async () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }
    const { r, antes, pilha } = await comMedidaPendente(design(FEED, [fundo(FEED), texto]), undefined, () => {
      ctx().updateLayer('bg-foto', (l) => ({ ...l, style: { ...l.style, crop } }))
    })
    expect(r).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().design.layers.find((l) => l.id === 'bg-foto')?.style?.crop).toEqual(crop)
    expect(pilha).toBe(true)
  })

  it('outra camada editada durante a medida: aplica sobre o estado ATUAL e a edição fica (dois desfazer)', async () => {
    await abrir(design(FEED, [fundo(FEED), texto]))
    const inicial = json(ctx().design)
    const m = medidaPendente()
    let p!: Promise<DesfechoDaInsercao>
    await emAct(() => {
      p = ctx().inserirGrade('2x2', m as never)
    })
    await emAct(() => ctx().updateLayer('titulo', (l) => ({ ...l, content: 'Editado' })))
    await emAct(async () => {
      m.responder({ src: FOTO, ...NAT })
      await deixarCorrer()
    })
    expect(await p).toMatchObject({ ok: true, convertida: 'bg-foto' })
    expect(ctx().design.layers.find((l) => l.id === 'titulo')?.content).toBe('Editado')
    await emAct(() => ctx().undo())
    expect(ctx().design.layers.find((l) => l.id === 'titulo')?.content).toBe('Editado')
    expect(ctx().design.layers.map((l) => l.id)).toContain('bg-foto')
    await emAct(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
  })
})

describe('G1 · provider real: troca de documento durante a medida', () => {
  it('outro template no mesmo provider: o resultado atrasado não é aplicado no documento novo', async () => {
    const d = design(FEED, [fundo(FEED), texto])
    const outro = design(FEED, [fundo(FEED), camada('outro', 'text')])
    const montagem = await abrir(d)
    const m = medidaPendente()
    let p!: Promise<DesfechoDaInsercao>
    await emAct(() => {
      p = ctx().inserirGrade('2x2', m as never)
    })
    await montagem.atualizar(arvore(recurso(2, outro)))
    const antes = json(ctx().design)
    expect(ctx().design.layers.map((l) => l.id)).toEqual(['bg-foto', 'outro'])
    await emAct(async () => {
      m.responder({ src: FOTO, ...NAT })
      await deixarCorrer()
    })
    expect(await p).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
  })
})
