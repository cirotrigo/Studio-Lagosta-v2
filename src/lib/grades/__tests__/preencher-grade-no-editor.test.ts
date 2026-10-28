/**
 * G2 · preencher pelo PROVIDER e pelo HOOK reais: `QueryClientProvider`, `MultiPageProvider` e `TemplateEditorProvider`
 * reais no host sem DOM, e `usePreencherGrade` real (o Drive vai pelo `useMutation` + `api` central). Dublês: só o
 * `use-pages` (dados das páginas), a REDE (`fetch` global responde `/api/google-drive-download` e recusa o resto), o
 * envio de arquivo e o medidor da foto (injetados no hook). Sem canvas, toast, clique real, Blob ou navegador.
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
import { TemplateEditorProvider, createDefaultLayer, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { useFotoNaGrade, usePreencherGrade, type FonteDaFoto } from '@/hooks/use-preencher-grade'
import { armarInsercaoDeClipe, consumirInsercaoDeClipe, desarmarInsercaoDeClipe } from '@/lib/video/insercao-de-clipe'
import { conferirGrade } from '../conferir'
import { refazerGrade } from '../operacoes'
import type { DesfechoDoPreenchimento, PlanoDePreenchimento } from '../preenchimento'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const C = `${BLOB}/fotos/c.jpg`
const NAT = { width: 1600, height: 1200 }
const FEED = { width: 1080, height: 1350 }
const GRADE = ['d0', 'd1', 'd2', 'd3']
const musica = { source: 'library', musicId: 9, startTime: 0, endTime: 12 } as DesignData['audio']

const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
// order fora de 0..n: o provider normaliza ao carregar
const design = (layers: Layer[], audio?: DesignData['audio']): DesignData =>
  ({ canvas: { ...FEED, backgroundColor: '#ffffff' }, layers: layers.map((l, i) => ({ ...l, order: 10 * i + 3 })), ...(audio ? { audio } : {}) }) as DesignData
const pagina = (id: string, d: DesignData) =>
  ({ id, name: id, width: d.canvas.width, height: d.canvas.height, layers: d.layers, order: 0, createdAt: '2026-10-27', updatedAt: '2026-10-27' }) as unknown as Page
const json = (d: DesignData) => JSON.stringify(d)
const camada = (id: string) => ctx().design.layers.find((l) => l.id === id)!

// ── Dublês: rede, envio e medidor ────────────────────────────────────────────
type PedidoDeRede = { url: string; corpo: { projectId: number; fileIds: string[] }; responder: (status: number, corpo: unknown) => void }
const rede: { pedidos: PedidoDeRede[] } = { pedidos: [] }
function redeFalsa() {
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    if (url !== '/api/google-drive-download') throw new Error(`rede bloqueada no teste: ${url}`)
    return new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')))
      rede.pedidos.push({
        url,
        corpo: JSON.parse(String(init.body)),
        responder: (status, corpo) => resolve(new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })),
      })
    })
  })
}
const envio: { pendentes: Array<{ nome: string; resolver: (url: string) => void; falhar: (e: Error) => void }> } = { pendentes: [] }
const medidor: { medidas: string[]; naoCarrega: Set<string>; segurar: boolean; presas: Array<() => void> } = { medidas: [], naoCarrega: new Set(), segurar: false, presas: [] }
const deps = {
  enviarArquivo: (arquivo: File) => new Promise<string>((resolver, falhar) => envio.pendentes.push({ nome: arquivo.name, resolver, falhar })),
  medirFoto: async (url: string) => {
    medidor.medidas.push(url)
    if (medidor.naoCarrega.has(url)) throw new Error('A foto demorou demais para carregar.')
    // `segurar`: o teste decide quando a medida volta
    if (medidor.segurar) await new Promise<void>((r) => medidor.presas.push(r))
    return { src: url, ...NAT }
  },
}
const drive = (id: string, nome = `${id.toLowerCase()}.jpg`): FonteDaFoto => ({ tipo: 'drive', id, nome })
const arquivo = (nome: string): FonteDaFoto => ({ tipo: 'arquivo', arquivo: new File(['x'], nome, { type: 'image/jpeg' }), nome })

// ── Montagem ────────────────────────────────────────────────────────────────
const sonda: {
  ctx: TemplateEditorContextValue | null
  paginas: ReturnType<typeof useMultiPage> | null
  lote: ReturnType<typeof usePreencherGrade> | null
  foto: ReturnType<typeof useFotoNaGrade> | null
} = { ctx: null, paginas: null, lote: null, foto: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  sonda.paginas = useMultiPage()
  sonda.lote = usePreencherGrade(deps)
  sonda.foto = useFotoNaGrade(deps)
  return null
}
const ctx = () => sonda.ctx!
const recurso = (d: DesignData): TemplateResource => ({ id: 1, name: 'T1', type: 'FEED', dimensions: '1080x1350', designData: d, dynamicFields: [], projectId: 5 })
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
  redeFalsa()
  const m = await montar(arvore(recurso(d)))
  desmontar = m.desmontar
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  rede.pedidos = []
  envio.pendentes = []
  medidor.medidas = []
  medidor.naoCarrega.clear()
  medidor.segurar = false
  medidor.presas = []
  desarmarInsercaoDeClipe()
  vi.unstubAllGlobals()
})

const correr = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}
const selecionar = (ids: string[]) => emAct(() => ctx().selectLayers(ids))

/** Plano (antes de qualquer API) e início do preenchimento, como fazem os painéis */
async function iniciar(quantas: 'uma' | number, fontes: FonteDaFoto[]) {
  let plano!: PlanoDePreenchimento
  let p: Promise<DesfechoDoPreenchimento> | undefined
  await emAct(async () => {
    plano = ctx().planejarPreenchimento(quantas)
    if (plano.tipo === 'grade') p = sonda.lote!.preencher(plano.alvo, fontes)
    await correr()
  })
  return { plano, p: p! }
}
const responderDrive = (status: number, corpo: unknown, i = 0) =>
  emAct(async () => {
    rede.pedidos[i].responder(status, corpo)
    await correr()
  })

describe('G2 · lote pelo provider e hook reais', () => {
  it('Drive [A,B,C] com resposta 200 parcial [C,A]: A e C nas células previstas, B listada e a célula dela intacta; UM desfazer; refazer traz os mesmos ids e metadados', async () => {
    await abrir(design([...doisPorDois(['', '', '', '']), texto]))
    await selecionar(GRADE)
    const inicial = json(ctx().design)
    const { plano, p } = await iniciar(3, [drive('A'), drive('B'), drive('C')])
    expect(plano).toMatchObject({ tipo: 'grade', modo: 'lote', alvo: { celulas: ['d0', 'd1', 'd2'] } })
    expect(rede.pedidos.map((r) => r.corpo)).toEqual([{ projectId: 5, fileIds: ['A', 'B', 'C'] }])
    expect(sonda.lote!.emVoo).toBe(true)
    expect(json(ctx().design)).toBe(inicial) // canvas intocado antes do lote validar
    expect(ctx().canUndo).toBe(false)

    await responderDrive(200, { files: [{ id: 'C', url: C, name: 'c.jpg' }, { id: 'A', url: A, name: 'a.jpg' }], uploaded: 2 })
    const r = await p
    expect(r).toMatchObject({ ok: true, aplicadas: ['d0', 'd2'] })
    expect(r.falhas).toEqual([{ celulaId: 'd1', nome: 'b.jpg', motivo: expect.any(String) }])
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, '', C, ''])
    expect([...medidor.medidas].sort()).toEqual([A, C])
    expect(conferirGrade(ctx().design.layers)).toEqual([])
    expect(ctx().selectedLayerIds).toEqual(GRADE)
    expect(sonda.lote!.emVoo).toBe(false)

    const depois = json(ctx().design)
    await emAct(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false) // um desfazer só
    await emAct(() => ctx().redo())
    expect(json(ctx().design)).toBe(depois)
  })

  it('URL data:/lh3 na resposta: nunca medida nem aplicada; prazo estourado do medidor também vira falha; o resto entra', async () => {
    await abrir(design(doisPorDois(['', '', '', ''])))
    await selecionar(GRADE)
    medidor.naoCarrega.add(C)
    const { p } = await iniciar(4, [drive('A'), drive('B'), drive('C'), drive('D')])
    await responderDrive(200, {
      files: [
        { id: 'A', url: 'data:image/jpeg;base64,AAAA' },
        { id: 'B', url: B },
        { id: 'C', url: C },
        { id: 'D', url: 'https://lh3.googleusercontent.com/d' },
      ],
    })
    const r = await p
    expect(r).toMatchObject({ ok: true, aplicadas: ['d1'] })
    expect(r.falhas.map((f) => f.celulaId)).toEqual(['d0', 'd2', 'd3'])
    expect([...medidor.medidas].sort()).toEqual([B, C])
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual(['', B, '', ''])
  })

  it('HTTP 404 do Drive: nada aplicado, sem histórico nem dirty; arquivo enviado pelo computador entra mesmo assim (lote misto)', async () => {
    await abrir(design(doisPorDois(['', '', '', ''])))
    await selecionar(GRADE)
    const { p } = await iniciar(2, [drive('A'), arquivo('meu.jpg')])
    await emAct(async () => {
      envio.pendentes[0].resolver(B)
      await correr()
    })
    await responderDrive(404, { error: 'Not found' })
    const r = await p
    expect(r).toMatchObject({ ok: true, aplicadas: ['d1'] })
    expect(r.falhas).toEqual([{ celulaId: 'd0', nome: 'a.jpg', motivo: expect.any(String) }])
  })
})

describe('G2 · foto única pelas entradas (upload, Drive, IA)', () => {
  it('grade inteira selecionada + upload: próxima célula vazia em ordem de leitura; o "+" armado continua armado e nada vira clipe', async () => {
    const [d0, d1, d2, d3] = doisPorDois([A, '', '', ''])
    await abrir(design([d3, texto, d1, d0, d2]))
    await selecionar(GRADE)
    armarInsercaoDeClipe()
    const quantas = ctx().design.layers.length
    const { plano, p } = await iniciar('uma', [arquivo('nova.jpg')])
    expect(plano).toMatchObject({ tipo: 'grade', modo: 'proxima', alvo: { celulas: ['d1'] } })
    await emAct(async () => {
      envio.pendentes[0].resolver(B)
      await correr()
    })
    expect(await p).toMatchObject({ ok: true, aplicadas: ['d1'], falhas: [] })
    expect(camada('d1').fileUrl).toBe(B)
    expect(ctx().design.layers).toHaveLength(quantas) // não passou pelo addLayer
    expect(ctx().design.layers.some((l) => (l as { clipe?: unknown }).clipe)).toBe(false)
    expect(rede.pedidos).toHaveLength(0)
    expect(consumirInsercaoDeClipe()).toBe(true)
  })

  it('célula selecionada com recorte + foto de IA (URL própria): substitui, cover, recorte LIMPO; nenhuma ida à rede', async () => {
    const [d0, ...resto] = doisPorDois([A, '', '', ''])
    await abrir(design([{ ...d0, style: { ...d0.style, crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 } } }, ...resto]))
    await selecionar(['d0'])
    const { plano, p } = await iniciar('uma', [{ tipo: 'url', url: B, nome: 'ia.png' }])
    expect(plano).toMatchObject({ modo: 'substituir', alvo: { celulas: ['d0'] } })
    expect(await p).toMatchObject({ ok: true, aplicadas: ['d0'] })
    expect(camada('d0').fileUrl).toBe(B)
    expect(camada('d0').style?.objectFit).toBe('cover')
    expect(camada('d0').style?.crop).toBeUndefined()
    expect(rede.pedidos).toHaveLength(0)
  })

  it('falha do Drive (200 sem o arquivo) preserva a foto da célula: nada aplicado, sem histórico nem dirty', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await selecionar(['d0'])
    const antes = json(ctx().design)
    const { p } = await iniciar('uma', [drive('B')])
    await responderDrive(200, { files: [], uploaded: 0 })
    expect(await p).toMatchObject({ ok: false, codigo: 'NADA_APLICADO', falhas: [{ celulaId: 'd0', nome: 'b.jpg' }] })
    expect(json(ctx().design)).toBe(antes)
    expect(camada('d0').fileUrl).toBe(A)
    expect(ctx().canUndo).toBe(false)
    expect(ctx().dirty).toBe(false)
  })

  it('grade cheia ⇒ o plano manda para a avulsa de sempre, com aviso; sem grade ⇒ avulsa sem aviso', async () => {
    await abrir(design([...doisPorDois([A, B, C, A]), texto]))
    await selecionar(GRADE)
    expect(ctx().planejarPreenchimento('uma')).toMatchObject({ tipo: 'avulsa', aviso: expect.stringMatching(/cheia/i) })
    await selecionar(['titulo'])
    expect(ctx().planejarPreenchimento('uma')).toEqual({ tipo: 'avulsa' })
  })

  it('célula girada ou página de vídeo: recusa no PLANO, antes de qualquer API', async () => {
    const [d0, d1, d2, d3] = doisPorDois(['', '', '', ''])
    await abrir(design([d0, { ...d1, rotation: 3 }, d2, d3]))
    await selecionar(['d0'])
    expect(ctx().planejarPreenchimento('uma')).toMatchObject({ tipo: 'recusa', codigo: 'GRADE_GIRADA' })
    const video = design(doisPorDois(['', '', '', '']), musica)
    await emAct(() => ctx().loadTemplate({ designData: video, markDirty: false, historyKey: 'p1' }))
    await selecionar(GRADE)
    expect(ctx().planejarPreenchimento('uma')).toMatchObject({ tipo: 'recusa', codigo: 'PAGINA_DE_VIDEO' })
    expect(ctx().planejarPreenchimento(2)).toMatchObject({ tipo: 'recusa', codigo: 'PAGINA_DE_VIDEO' })
    expect(rede.pedidos).toHaveLength(0)
  })
})

describe('G2 · o alvo muda DURANTE o download: nada atrasado é aplicado e a edição concorrente fica', () => {
  const recorte = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }
  const mudar = (id: string, f: (l: Layer) => Layer) => ctx().updateLayer(id, f)
  /**
   * `durante` é a ÚLTIMA edição concorrente (`preparar`, o que vem antes dela). `desfaz`: a edição entra no histórico
   * da página aberta. Com histórico, UM desfazer depois do lote recusado tem de voltar exatamente ao predecessor da
   * edição (um snapshot a mais do lote pararia num estado intermediário); sem histórico, `canUndo` segue falso.
   */
  type Cenario = { durante: () => void; preparar?: () => void; desfaz: boolean; codigo: DesfechoDoPreenchimento['codigo'] }
  it.each<[string, Cenario]>([
    ['recorte de OUTRA célula (não alvo)', { durante: () => mudar('d0', (l) => ({ ...l, style: { ...l.style, crop: recorte } })), desfaz: true, codigo: 'ALVO_MUDOU' }],
    // G4.3 (27/10): célula não se move, redimensiona nem sai sozinha pela edição genérica — a mudança concorrente vem
    // das operações que existem: mover a grade inteira (G3), refazer a caixa (G0) e excluir a grade inteira selecionada
    ['célula alvo movida (a grade inteira anda)', { durante: () => void ctx().moverSelecao(['d1'], 10, 0), desfaz: true, codigo: 'ALVO_MUDOU' }],
    [
      'célula alvo redimensionada (caixa da grade refeita)',
      {
        durante: () =>
          ctx().setDesign((prev) => {
            const membros = prev.layers.filter((l) => l.metadata?.groupId === 'g2')
            const r = refazerGrade(membros, { caixa: { x: 0, y: 0, w: 1000, h: 1200 } }, new Map([[A, NAT]]))
            if (!r.ok) throw new Error('fixture')
            return { ...prev, layers: [...prev.layers.filter((l) => l.metadata?.groupId !== 'g2'), ...r.valor.celulas] }
          }),
        desfaz: false,
        codigo: 'ALVO_MUDOU',
      },
    ],
    ['grade removida (inteira selecionada, um desfazer)', { durante: () => ctx().removeLayers(GRADE), desfaz: true, codigo: 'ALVO_MUDOU' }],
    [
      'layout trocado (refazerGrade do G0)',
      {
        durante: () =>
          ctx().setDesign((prev) => {
            const membros = prev.layers.filter((l) => l.metadata?.groupId === 'g2')
            const r = refazerGrade(membros, { layout: '2-colunas' }, new Map([[A, NAT]]))
            if (!r.ok) throw new Error('fixture')
            return { ...prev, layers: [...prev.layers.filter((l) => l.metadata?.groupId !== 'g2'), ...r.valor.celulas] }
          }),
        desfaz: false,
        codigo: 'ALVO_MUDOU',
      },
    ],
    [
      'troca de página (PageSync carrega a outra)',
      {
        durante: () => {
          sonda.paginas!.setCurrentPageId('p2')
          ctx().loadTemplate({ designData: design([texto]), markDirty: false, historyKey: 'p2' })
        },
        desfaz: false,
        codigo: 'ALVO_MUDOU',
      },
    ],
    [
      'ida e volta à MESMA página (carga nova)',
      { durante: () => ctx().loadTemplate({ designData: design(doisPorDois([A, '', '', ''])), markDirty: false, historyKey: 'p1' }), desfaz: false, codigo: 'ALVO_MUDOU' },
    ],
    ['a página virou vídeo (música)', { durante: () => ctx().setPageAudio(musica), desfaz: true, codigo: 'PAGINA_DE_VIDEO' }],
  ])('%s', async (_n, { durante, preparar, desfaz, codigo }) => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await selecionar(GRADE)
    const { p } = await iniciar('uma', [drive('B')])
    if (preparar) await emAct(preparar)
    const predecessor = json(ctx().design)
    await emAct(durante)
    const antes = json(ctx().design)
    await responderDrive(200, { files: [{ id: 'B', url: B }] })
    expect(await p).toMatchObject({ ok: false, codigo })
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(desfaz)
    if (desfaz) {
      await emAct(() => ctx().undo())
      expect(json(ctx().design)).toBe(predecessor)
    }
  })

  it('outra camada editada durante o download: aplica sobre o estado ATUAL e a edição fica (dois desfazer)', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    await selecionar(GRADE)
    const inicial = json(ctx().design)
    const { p } = await iniciar('uma', [drive('B')])
    await emAct(() => ctx().updateLayer('titulo', (l) => ({ ...l, content: 'Editado' })))
    await responderDrive(200, { files: [{ id: 'B', url: B }] })
    expect(await p).toMatchObject({ ok: true, aplicadas: ['d1'] })
    expect(camada('d1').fileUrl).toBe(B) // aplicado de fato, não sucesso no-op
    expect(camada('titulo').content).toBe('Editado')
    await emAct(() => ctx().undo())
    expect(camada('d1').fileUrl).toBe('')
    expect(camada('titulo').content).toBe('Editado')
    await emAct(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
  })
})

describe('G2 · cancelamento e concorrência', () => {
  it('cancelar com upload e download pendentes: CANCELADO na hora, nada aplicado, sem histórico; respostas atrasadas não mudam nada', async () => {
    await abrir(design(doisPorDois(['', '', '', ''])))
    await selecionar(GRADE)
    const antes = json(ctx().design)
    const { p } = await iniciar(2, [arquivo('a.jpg'), drive('B')])
    expect(sonda.lote!.emVoo).toBe(true)
    await emAct(async () => {
      sonda.lote!.cancelar()
      await correr()
    })
    expect(await p).toMatchObject({ ok: false, codigo: 'CANCELADO' })
    expect(sonda.lote!.emVoo).toBe(false)
    await emAct(async () => {
      envio.pendentes[0].resolver(A)
      await correr()
    })
    expect(json(ctx().design)).toBe(antes)
    expect(ctx().canUndo).toBe(false)
    expect(medidor.medidas).toEqual([])
  })

  it('decisão ADIADA: edição legítima já na fila, o lote chega ao updater e é cancelado antes de drenar ⇒ CANCELADO, foto preservada, só a edição no histórico; segundo pedido EM_ANDAMENTO até a decisão', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    await selecionar(['d0'])
    const inicial = json(ctx().design)
    medidor.segurar = true
    const { plano, p } = await iniciar('uma', [{ tipo: 'url', url: B, nome: 'ia.png' }])
    expect(medidor.presas).toHaveLength(1)
    let segundo!: Promise<DesfechoDoPreenchimento>
    // Dentro do mesmo act nada renderiza: a edição do título fica na fila, e por isso o updater do lote NÃO roda na
    // hora (sem estado ansioso); a medida volta, o hook chega ao `preencherGrade` e só então vem o cancelar.
    await emAct(async () => {
      ctx().updateLayer('titulo', (l) => ({ ...l, content: 'Editado' }))
      medidor.presas[0]()
      await correr()
      if (plano.tipo === 'grade') segundo = sonda.lote!.preencher(plano.alvo, [{ tipo: 'url', url: C, nome: 'c.png' }])
      await correr()
      sonda.lote!.cancelar()
    })
    expect(await Promise.race([segundo, correr().then(() => 'pendente')])).toMatchObject({ ok: false, codigo: 'EM_ANDAMENTO' })
    expect(await p).toMatchObject({ ok: false, codigo: 'CANCELADO' })
    expect(camada('d0').fileUrl).toBe(A)
    expect(camada('titulo').content).toBe('Editado')
    expect(sonda.lote!.emVoo).toBe(false)
    await emAct(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
    expect(ctx().canUndo).toBe(false) // só a edição legítima estava no histórico

    // decidido o primeiro, um pedido novo volta a ser aceito
    medidor.segurar = false
    await selecionar(['d0'])
    const novo = await iniciar('uma', [{ tipo: 'url', url: C, nome: 'c.png' }])
    expect(await novo.p).toMatchObject({ ok: true, aplicadas: ['d0'] })
    expect(camada('d0').fileUrl).toBe(C)
  })

  it('um preenchimento por vez: o segundo, com o primeiro em voo, é recusado sem ir à rede', async () => {
    await abrir(design(doisPorDois(['', '', '', ''])))
    await selecionar(GRADE)
    const { plano, p } = await iniciar('uma', [drive('A')])
    let segundo!: DesfechoDoPreenchimento
    await emAct(async () => {
      if (plano.tipo === 'grade') segundo = await sonda.lote!.preencher(plano.alvo, [drive('B')])
    })
    expect(segundo).toMatchObject({ ok: false, codigo: 'EM_ANDAMENTO' })
    expect(rede.pedidos).toHaveLength(1)
    await responderDrive(200, { files: [{ id: 'A', url: A }] })
    expect(await p).toMatchObject({ ok: true, aplicadas: ['d0'] })
  })
})

describe('G2 · foto única pelo hook das entradas (useFotoNaGrade)', () => {
  /** A avulsa que a entrada monta (como o painel monta), com sujeira de propósito: a grade cheia não pode herdá-la */
  const avulsa = (id: string) => ({ ...createDefaultLayer('image'), id, name: 'Imagem', fileUrl: B, metadata: { groupId: 'g2' }, clipe: { duracao: 3 } }) as Layer
  // como `iniciar`: a promessa do preenchimento resolve no updater, que só roda quando o act drena (nunca aguardar dentro)
  async function colocar(fonte: FonteDaFoto, avulsaDaEntrada: (inserir: (camada: Layer) => void) => unknown) {
    let p!: Promise<unknown>
    await emAct(async () => {
      p = sonda.foto!.colocar(sonda.foto!.planejar(), fonte, avulsaDaEntrada)
      await correr()
    })
    return (await p) as DesfechoDoPreenchimento | PlanoDePreenchimento
  }

  it('grade CHEIA + "+" armado: avulsa comum no topo, sem clipe, metadado ou grupo; o "+" continua armado; um desfazer', async () => {
    await abrir(design([...doisPorDois([A, B, C, A]), texto]))
    await selecionar(GRADE)
    armarInsercaoDeClipe()
    const inicial = json(ctx().design)
    expect(await colocar({ tipo: 'url', url: B, nome: 'b.png' }, (inserir) => inserir(avulsa('nova')))).toMatchObject({ tipo: 'avulsa', gradeCheia: true })
    const nova = ctx().design.layers[ctx().design.layers.length - 1]
    expect(nova.id).toBe('nova')
    expect(nova.metadata).toBeUndefined()
    expect((nova as { clipe?: unknown }).clipe).toBeUndefined()
    expect(ctx().design.layers.some((l) => (l as { clipe?: unknown }).clipe)).toBe(false)
    expect(ctx().selectedLayerIds).toEqual(['nova'])
    expect(consumirInsercaoDeClipe()).toBe(true)
    await emAct(() => ctx().undo())
    expect(json(ctx().design)).toBe(inicial)
  })

  it('SEM grade + "+" armado: o legado de sempre (addLayer consome o "+")', async () => {
    await abrir(design([...doisPorDois(['', '', '', '']), texto]))
    await selecionar(['titulo'])
    armarInsercaoDeClipe()
    const limpa = { ...createDefaultLayer('image'), id: 'nova', name: 'Imagem', fileUrl: B } as Layer
    expect(await colocar({ tipo: 'url', url: B, nome: 'b.png' }, (inserir) => inserir(limpa))).toEqual({ tipo: 'avulsa' })
    expect(ctx().design.layers.some((l) => l.id === 'nova')).toBe(true)
    expect(consumirInsercaoDeClipe()).toBe(false)
  })

  it('grade com vaga: vai para a célula (nunca para a avulsa da entrada); recusa não chama a avulsa', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await selecionar(GRADE)
    let chamouAvulsa = false
    expect(await colocar({ tipo: 'url', url: B, nome: 'b.png' }, () => void (chamouAvulsa = true))).toMatchObject({ ok: true, aplicadas: ['d1'] })
    expect(camada('d1').fileUrl).toBe(B)
    expect(chamouAvulsa).toBe(false)
    await emAct(() => ctx().setPageAudio(musica))
    await selecionar(GRADE)
    expect(await colocar({ tipo: 'url', url: C, nome: 'c.png' }, () => void (chamouAvulsa = true))).toMatchObject({ tipo: 'recusa', codigo: 'PAGINA_DE_VIDEO' })
    expect(chamouAvulsa).toBe(false)
  })
})
