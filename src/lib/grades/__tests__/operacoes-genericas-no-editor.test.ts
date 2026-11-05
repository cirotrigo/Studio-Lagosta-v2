/**
 * G4.3 · as operações GENÉRICAS pelo PROVIDER real (`QueryClientProvider`, `MultiPageProvider` e `TemplateEditorProvider`
 * reais no host sem DOM do G1; dublês só de `use-pages` e do toast), chamadas do jeito que os atalhos, a barra e os
 * painéis chamam: Delete = `selectedLayerIds.forEach(removeLayer)`; Cmd+J/toolbar = `duplicateLayer(id)`; "duplicar
 * seleção" do painel de camadas = `forEach(duplicateLayer)`; Cmd+C/Cmd+V; Cmd+G/Cmd+Shift+G; propriedades, painéis e o
 * gerador de criativo pelo `updateLayer`/`updateLayerPartial`/`updateLayerStyle`/`moveLayer`; alinhar e distribuir.
 * Não monta a EditorCanvas, o stage nem o painel de camadas (os handlers só chamam estas funções).
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
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { MENSAGEM_ALINHAR_GRADE } from '../ajustes'
import { MENSAGEM_AGRUPAR_GRADE, MENSAGEM_CELULA_PROTEGIDA } from '../no-editor'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, celula, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const CROP = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }
const GRADE = ['d0', 'd1', 'd2', 'd3']
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const avulsa = { id: 'avulsa', type: 'image', name: 'Avulsa', visible: true, locked: false, order: 0, position: { x: 700, y: 20 }, size: { width: 200, height: 100 }, fileUrl: A, style: { objectFit: 'cover' } } as Layer
const inicial = (): DesignData => {
  const g = doisPorDois([A, B, '', A])
  g[1] = { ...g[1], style: { ...g[1].style, crop: CROP } }
  return { canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' }, layers: [...g, texto, avulsa].map((l, i) => ({ ...l, order: i })) } as DesignData
}
const pagina = (id: string, d: DesignData) => ({ id, name: id, width: d.canvas.width, height: d.canvas.height, layers: d.layers, order: 0 }) as unknown as Page

const sonda: { ctx: TemplateEditorContextValue | null } = { ctx: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  return null
}
const ctx = () => sonda.ctx!
const camada = (id: string) => ctx().design.layers.find((l) => l.id === id)
const camadas = () => JSON.stringify(ctx().design.layers)
let desmontar: (() => Promise<void>) | null = null
async function abrir(d = inicial()) {
  h.paginas = { data: [pagina('p1', d)], isLoading: false, refetch: () => undefined }
  const t: TemplateResource = { id: 1, name: 'T1', type: 'FEED', dimensions: '1080x1350', designData: d, dynamicFields: [], projectId: 5 }
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
/** Desfaz uma vez e confere que voltou ao estado `antes`, e que não havia mais nada a desfazer além dele */
async function umDesfazerVoltaA(antes: string) {
  await agir(() => ctx().undo())
  expect(camadas()).toBe(antes)
}

describe('G4.3 · excluir em LOTE (Delete, botão do shell e Delete do painel = removeLayers(seleção), uma operação)', () => {
  const apagarSelecao = () => agir(() => ctx().removeLayers(ctx().selectedLayerIds))

  it('grade inteira selecionada: sai inteira num desfazer; o desfazer volta byte a byte e não sobra passo', async () => {
    await abrir()
    await selecionar(GRADE)
    const antes = camadas()
    await apagarSelecao()
    expect(ctx().design.layers.map((l) => l.id)).toEqual(['titulo', 'avulsa'])
    expect(ctx().selectedLayerIds).toEqual([])
    await umDesfazerVoltaA(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('duas células PARCIAIS com foto: as duas esvaziam numa operação; UM desfazer restaura as duas e não há segundo passo', async () => {
    await abrir()
    await selecionar(['d0', 'd1'])
    const antes = camadas()
    await apagarSelecao()
    expect([camada('d0')!.fileUrl, camada('d1')!.fileUrl]).toEqual(['', ''])
    expect(camada('d1')!.style!.crop).toBeUndefined()
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect([...ctx().selectedLayerIds].sort()).toEqual(['d0', 'd1'])
    await umDesfazerVoltaA(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('célula + texto + foto avulsa: célula esvazia, texto e avulsa saem — UMA operação, um desfazer restaura tudo', async () => {
    await abrir()
    await selecionar(['d0', 'titulo', 'avulsa'])
    const antes = camadas()
    await apagarSelecao()
    expect(camada('titulo')).toBeUndefined()
    expect(camada('avulsa')).toBeUndefined()
    expect(camada('d0')!.fileUrl).toBe('')
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect(ctx().selectedLayerIds).toEqual(['d0'])
    await umDesfazerVoltaA(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('grade inteira + texto: os dois saem numa operação, um desfazer', async () => {
    await abrir()
    await selecionar([...GRADE, 'titulo'])
    const antes = camadas()
    await apagarSelecao()
    expect(ctx().design.layers.map((l) => l.id)).toEqual(['avulsa'])
    await umDesfazerVoltaA(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('lixeira da LINHA de uma célula (removeLayer(id)): esvazia só ela, segue selecionada; célula já vazia: nada muda, nenhum desfazer', async () => {
    await abrir()
    await selecionar(GRADE)
    const antes = camadas()
    await agir(() => ctx().removeLayer('d1'))
    expect(camada('d1')).toMatchObject({ fileUrl: '' })
    expect(camada('d1')!.style!.crop).toBeUndefined()
    expect(camada('d0')!.fileUrl).toBe(A)
    expect(ctx().selectedLayerIds).toEqual(GRADE)
    await umDesfazerVoltaA(antes)
    await agir(() => ctx().removeLayer('d2'))
    expect(camadas()).toBe(antes)
    expect(ctx().canUndo).toBe(false)
  })
})

/**
 * Residual da rodada 1 (grade de UMA célula, `1-celula`): a célula sozinha É a grade inteira. A lixeira da LINHA
 * (`removeLayer`) é a intenção de limpar a célula — esvazia, vazia é no-op — e nunca apaga a grade; o Delete da SELEÇÃO
 * (`removeLayers`) com ela selecionada continua tirando a grade inteira.
 */
describe('G4.3 · grade de uma célula: lixeira da linha × Delete da seleção', () => {
  const caixa = { x: 0, y: 0, w: 1080, h: 1350 }
  const umaCelula = (fileUrl: string) =>
    ({
      canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' },
      layers: [
        { ...celula('u0', { id: 'g1', layout: '1-celula', caixa }, 0, caixa, { fileUrl, ...(fileUrl ? { style: { objectFit: 'cover', border: { radius: 0 }, crop: CROP } } : {}) } as Partial<Layer>), order: 0 },
        { ...texto, order: 1 },
      ],
    }) as DesignData

  it('com foto: a lixeira da linha ESVAZIA a célula (sem recorte), a grade fica; um desfazer volta e não sobra passo', async () => {
    await abrir(umaCelula(A))
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await selecionar(['u0'])
    const antes = camadas()
    await agir(() => ctx().removeLayer('u0'))
    expect(camada('u0')).toMatchObject({ fileUrl: '' })
    expect(camada('u0')!.style!.crop).toBeUndefined()
    expect(metadadoDeGrade(camada('u0')!)!.layout).toBe('1-celula')
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect(ctx().selectedLayerIds).toEqual(['u0'])
    await umDesfazerVoltaA(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('vazia: a lixeira da linha não muda nada e não cria desfazer', async () => {
    await abrir(umaCelula(''))
    await selecionar(['u0'])
    const antes = camadas()
    await agir(() => ctx().removeLayer('u0'))
    expect(camadas()).toBe(antes)
    expect(ctx().canUndo).toBe(false)
  })

  it('Delete da SELEÇÃO (removeLayers) com a célula selecionada: a grade inteira sai, um desfazer', async () => {
    await abrir(umaCelula(A))
    await selecionar(['u0'])
    const antes = camadas()
    await agir(() => ctx().removeLayers(ctx().selectedLayerIds))
    expect(ctx().design.layers.map((l) => l.id)).toEqual(['titulo'])
    await umDesfazerVoltaA(antes)
    expect(ctx().canUndo).toBe(false)
  })
})

describe('G4.3 · copiar/colar e duplicar', () => {
  it('Cmd+C/Cmd+V da grade inteira: grade NOVA coerente num desfazer, seleção nas células novas', async () => {
    await abrir()
    await selecionar(GRADE)
    const antes = camadas()
    await agir(() => ctx().copySelectedLayers())
    await agir(() => ctx().pasteLayers())
    const novas = ctx().design.layers.filter((l) => !inicial().layers.some((o) => o.id === l.id))
    expect(novas).toHaveLength(4)
    const g = metadadoDeGrade(novas[0])!.id
    expect(g).not.toBe('g2')
    expect(novas.every((c) => metadadoDeGrade(c)!.id === g && c.metadata!.groupId === g)).toBe(true)
    expect(metadadoDeGrade(novas[0])!.caixa).toEqual({ x: 24, y: 24, w: 1080, h: 1350 })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect([...ctx().selectedLayerIds].sort()).toEqual(novas.map((c) => c.id).sort())
    await umDesfazerVoltaA(antes)
  })

  it('Cmd+C/Cmd+V de UMA célula: foto avulsa, sem vínculo; a grade original segue intacta', async () => {
    await abrir()
    await selecionar(['d1'])
    await agir(() => ctx().copySelectedLayers())
    await agir(() => ctx().pasteLayers())
    const [nova] = ctx().design.layers.filter((l) => !inicial().layers.some((o) => o.id === l.id))
    expect(nova.metadata?.grade).toBeUndefined()
    expect(nova.metadata?.groupId).toBeUndefined()
    expect(nova.style).toMatchObject({ crop: CROP })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })

  it('"duplicar seleção" do painel (forEach por membro) com a grade inteira: UMA grade nova, num desfazer', async () => {
    await abrir()
    await selecionar(GRADE)
    const antes = camadas()
    await agir(() => {
      const { selectedLayerIds, duplicateLayer } = ctx()
      selectedLayerIds.forEach((id) => duplicateLayer(id))
    })
    const novas = ctx().design.layers.filter((l) => !inicial().layers.some((o) => o.id === l.id))
    expect(novas).toHaveLength(4)
    expect(new Set(novas.map((c) => metadadoDeGrade(c)!.id)).size).toBe(1)
    expect(novas.map((c) => c.position)).toEqual(inicial().layers.slice(0, 4).map((c) => ({ x: c.position!.x + 16, y: c.position!.y + 16 })))
    // logo depois da última célula da original, abaixo do texto
    expect(ctx().design.layers.map((l) => l.id).indexOf('titulo')).toBe(8)
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await umDesfazerVoltaA(antes)
    // depois de nova seleção, duplicar de novo vale (Cmd+J/toolbar: uma chamada só)
    await selecionar(GRADE)
    await agir(() => ctx().duplicateLayer(ctx().selectedLayerIds[0]))
    expect(ctx().design.layers.filter((l) => metadadoDeGrade(l))).toHaveLength(8)
  })

  it('duplicar UMA célula: foto avulsa deslocada 16, sem vínculo', async () => {
    await abrir()
    await selecionar(['d0'])
    await agir(() => ctx().duplicateLayer('d0'))
    const [nova] = ctx().design.layers.filter((l) => !inicial().layers.some((o) => o.id === l.id))
    expect(nova.metadata?.grade).toBeUndefined()
    expect(nova.metadata?.groupId).toBeUndefined()
    expect(nova.position).toEqual({ x: 16, y: 16 })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })
})

describe('G4.3 · agrupar e desagrupar', () => {
  it('Cmd+G com célula na seleção: recusa com motivo, nada muda; sem célula, agrupa como sempre', async () => {
    await abrir()
    await selecionar(['d0', 'titulo'])
    const antes = camadas()
    await agir(() => ctx().groupSelectedLayers())
    expect(camadas()).toBe(antes)
    expect(h.toasts.at(-1)?.description).toBe(MENSAGEM_AGRUPAR_GRADE)
    await selecionar(['titulo', 'avulsa'])
    await agir(() => ctx().groupSelectedLayers())
    expect(camada('titulo')!.metadata!.groupId).toBe(camada('avulsa')!.metadata!.groupId)
  })

  it('Cmd+Shift+G com UMA célula: desvincula a grade inteira (grade e groupId de todos) num desfazer, fotos intactas', async () => {
    await abrir()
    await selecionar(['d2'])
    const antes = camadas()
    await agir(() => ctx().ungroupLayers())
    for (const id of GRADE) expect([camada(id)!.metadata?.grade, camada(id)!.metadata?.groupId]).toEqual([undefined, undefined])
    expect(camada('d1')!.style).toMatchObject({ crop: CROP })
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    await umDesfazerVoltaA(antes)
  })
})

describe('G4.3 · edição genérica (propriedades, painéis, gerador de criativo)', () => {
  it.each([
    ['updateLayerPartial posição', () => ctx().updateLayerPartial('d1', { position: { x: 600, y: 0 } })],
    ['moveLayer (seta antiga)', () => ctx().moveLayer('d1', 10, 0)],
    ['updateLayerStyle cantos', () => ctx().updateLayerStyle('d1', { border: { radius: 40 } } as Layer['style'])],
    ['updateLayerStyle ajuste contain', () => ctx().updateLayerStyle('d1', { objectFit: 'contain' })],
    ['gerador de criativo: foto data:', () => ctx().updateLayer('d1', (l) => ({ ...l, fileUrl: 'data:image/png;base64,aGVsbG8=' }))],
  ])('%s na célula: recusado com motivo, nada muda, sem desfazer', async (_nome, f) => {
    await abrir()
    const antes = camadas()
    await agir(f)
    expect(camadas()).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(h.toasts.length).toBe(1)
  })

  it('gerador de criativo (onLayerUpdate = updateLayer com ...updates): foto do Blob entra pela regra da célula (recorte limpo)', async () => {
    await abrir()
    await agir(() => ctx().updateLayer('d1', (l) => ({ ...l, ...{ fileUrl: `${BLOB}/fotos/nova.jpg` } })))
    expect(camada('d1')).toMatchObject({ fileUrl: `${BLOB}/fotos/nova.jpg` })
    expect(camada('d1')!.style!.crop).toBeUndefined()
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })

  it('na célula seguem livres: opacidade, recorte da foto, espelho; foto avulsa e texto como sempre', async () => {
    await abrir()
    await agir(() => ctx().updateLayerStyle('d1', { opacity: 0.4, flipH: true, crop: { x: 0, y: 0, width: 1, height: 0.5 } }))
    expect(camada('d1')!.style).toMatchObject({ opacity: 0.4, flipH: true, crop: { x: 0, y: 0, width: 1, height: 0.5 } })
    await agir(() => ctx().moveLayer('avulsa', 10, 5))
    expect(camada('avulsa')!.position).toEqual({ x: 710, y: 25 })
    await agir(() => ctx().updateLayerPartial('titulo', { position: { x: 1, y: 2 } }))
    expect(camada('titulo')!.position).toEqual({ x: 1, y: 2 })
    expect(h.toasts).toEqual([])
    expect(conferirGrade(ctx().design.layers)).toEqual([])
  })
})

describe('G4.3 · alinhar e distribuir com célula (MVP: bloqueados com motivo, inclusive seleção mista)', () => {
  it.each([
    ['alinhar à esquerda', () => ctx().alignSelectedLeft()],
    ['centralizar na página', () => ctx().alignSelectedToCanvasCenterH()],
    ['distribuir na horizontal', () => ctx().distributeSelectedH()],
    ['distribuir na vertical', () => ctx().distributeSelectedV()],
  ])('%s com célula + texto: nada muda, motivo da grade', async (_nome, f) => {
    await abrir()
    await selecionar(['d0', 'titulo', 'avulsa'])
    const antes = camadas()
    await agir(f)
    expect(camadas()).toBe(antes)
    expect(h.toasts.at(-1)?.description).toBe(MENSAGEM_ALINHAR_GRADE)
  })
})

describe('G4.3 · motivo da célula protegida é o declarado', () => {
  it('mover a célula pelo painel cita a barra da grade', async () => {
    await abrir()
    await agir(() => ctx().updateLayerPartial('d0', { size: { width: 10, height: 10 } }))
    expect(h.toasts.at(-1)?.description).toBe(MENSAGEM_CELULA_PROTEGIDA)
  })
})
