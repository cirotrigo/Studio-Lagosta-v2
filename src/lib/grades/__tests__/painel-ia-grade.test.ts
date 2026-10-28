/**
 * G2 · LIGAÇÃO do painel de IA real (`AIImagesPanel`: biblioteca e geração) com o preenchimento, no host sem DOM do G1.
 * Providers e painel reais; as props são CHAMADAS direto na árvore do host (não é clique de navegador). Dublês: hooks e
 * componentes periféricos do painel (créditos, projeto, prompts, Radix, seletores), o medidor, o toast e a REDE
 * (`fetch` responde só a biblioteca e a geração). Sem crédito, IA, Blob ou navegador reais.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  segurar: false,
  presas: [] as Array<() => void>,
  geracoes: [] as Array<(corpo: unknown) => void>,
  passa: ({ children }: { children?: unknown }) => children ?? null,
  nada: () => null,
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = () => undefined
  return { toast, useToast: () => ({ toast }) }
})
vi.mock('@/hooks/use-credits', () => ({
  useCredits: () => ({ credits: null, isLoading: false, creditosAplicados: false, canPerformOperation: () => true, getCost: () => 0, refresh: () => undefined }),
}))
vi.mock('@/hooks/use-project', () => ({ useProject: () => ({ data: {} }) }))
vi.mock('@/hooks/use-photoswipe', () => ({ usePhotoSwipe: () => undefined }))
vi.mock('@/hooks/use-drive', () => ({ useUploadImageToDrive: () => ({ mutate: () => undefined }) }))
vi.mock('@/hooks/use-prompts', () => ({ usePrompts: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/use-improve-prompt', () => ({ useImprovePrompt: () => ({ mutate: () => undefined, isPending: false }) }))
vi.mock('@/components/ui/tabs', () => ({ Tabs: h.passa, TabsList: h.passa, TabsTrigger: h.passa, TabsContent: h.passa }))
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: h.passa, ScrollBar: h.nada }))
vi.mock('@/components/ui/select', () => ({ Select: h.passa, SelectContent: h.passa, SelectItem: h.passa, SelectTrigger: h.passa, SelectValue: h.nada }))
vi.mock('@/components/ui/dialog', () => ({ Dialog: h.nada, DialogContent: h.nada, DialogDescription: h.nada, DialogHeader: h.nada, DialogTitle: h.nada }))
vi.mock('@/components/ui/progress', () => ({ Progress: h.nada }))
vi.mock('@/components/projects/google-drive-folder-selector', () => ({ DesktopGoogleDriveModal: h.nada }))
vi.mock('@/components/ai/ai-model-selector', () => ({ AIModelSelector: h.nada, ResolutionSelector: h.nada }))
vi.mock('@/components/prompts/save-prompt-dialog', () => ({ SavePromptDialog: h.nada }))
vi.mock('@/components/prompts/reference-images-grid', () => ({ ReferenceImagesGrid: h.nada }))
vi.mock('next/image', () => ({ default: h.nada }))
vi.mock('@/lib/grades/medir-foto', () => ({
  medirFotoNoNavegador: async (url: string) => {
    if (h.segurar) await new Promise<void>((r) => h.presas.push(r))
    return { src: url, width: 1600, height: 1200 }
  },
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { AIImagesPanel } from '@/components/templates/sidebar/ai-images-panel'
import { armarInsercaoDeClipe, consumirInsercaoDeClipe, desarmarInsercaoDeClipe } from '@/lib/video/insercao-de-clipe'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const BIB = `${BLOB}/ia/biblioteca.png`
const GEROU = `${BLOB}/ia/gerada.png`
const GRADE = ['d0', 'd1', 'd2', 'd3']
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const design = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers }) as DesignData
const resposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

function redeFalsa() {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/api/projects/5/ai-images') {
      return resposta([{ id: 'r1', name: 'biblioteca.png', prompt: 'p', mode: 'GENERATE', fileUrl: BIB, thumbnailUrl: BIB, width: 1080, height: 1080, aspectRatio: '1:1', model: 'm', createdAt: '2026-10-27' }])
    }
    if (url === '/api/ai/generate-image') return new Promise<Response>((r) => h.geracoes.push((corpo) => r(resposta(corpo))))
    throw new Error(`rede bloqueada no teste: ${url}`)
  })
}

type No = { type: string; props: Record<string, unknown>; filhos: unknown[] }
const raiz: { atual: No | null } = { atual: null }
const sonda: { ctx: TemplateEditorContextValue | null } = { ctx: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  return null
}
const ctx = () => sonda.ctx!
const nos = (no: unknown = raiz.atual): No[] => (no && typeof no === 'object' && 'filhos' in no ? [no as No, ...(no as No).filhos.flatMap((f) => nos(f))] : [])
const textoDe = (no: unknown): string =>
  no && typeof no === 'object' ? ('texto' in no ? String((no as { texto: string }).texto) : 'filhos' in no ? (no as No).filhos.map(textoDe).join('') : '') : ''
const achar = (f: (n: No) => boolean) => {
  const n = nos().find(f)
  if (!n) throw new Error('nó não encontrado')
  return n
}
const correr = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}
const agir = (f: () => unknown) =>
  emAct(async () => {
    f()
    await correr()
  })
const evento = { preventDefault: () => undefined, stopPropagation: () => undefined }
const botaoAdicionar = () => achar((n) => n.type === 'button' && n.props.title === 'Adicionar ao canvas')
const adicionarDaBiblioteca = () => agir(() => (botaoAdicionar().props.onClick as (e: unknown) => void)(evento))
const botaoGerar = () => achar((n) => n.type === 'button' && textoDe(n).includes('Gerar Imagem'))
const controle = () => nos().filter((n) => n.props?.['data-aplicando'] === 'grade')
const cancelarAplicacao = () => agir(() => (achar((n) => n.type === 'button' && n.props['aria-label'] === 'Cancelar aplicação na grade').props.onClick as () => void)())
const camada = (id: string) => ctx().design.layers.find((l) => l.id === id)!

let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData) {
  h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1350, layers: d.layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
  redeFalsa()
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
          React.createElement('raiz-do-teste', { ref: (n: No | null) => void (raiz.atual = n) }, React.createElement(AIImagesPanel), React.createElement(Sonda)),
        ),
      ),
    ),
  )
  desmontar = m.desmontar
  await emAct(correr) // a biblioteca carrega no mount
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  h.segurar = false
  h.presas = []
  h.geracoes = []
  desarmarInsercaoDeClipe()
  vi.unstubAllGlobals()
})

describe('G2 · painel IA: biblioteca', () => {
  it('grade selecionada: enquanto a foto é medida aparece "Aplicando na grade" com Cancelar; cancelar não aplica; depois aplica na próxima vazia', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await agir(() => ctx().selectLayers(GRADE))
    h.segurar = true
    await adicionarDaBiblioteca()
    expect(controle()).toHaveLength(1)
    expect(textoDe(controle()[0])).toMatch(/Aplicando na grade/)
    // em voo: o botão fica desabilitado e a guarda segura até a chamada direta, inclusive para a avulsa (sem grade)
    expect(botaoAdicionar().props.disabled).toBe(true)
    const camadas = ctx().design.layers.length
    await agir(() => ctx().selectLayers([]))
    await adicionarDaBiblioteca()
    expect(ctx().design.layers).toHaveLength(camadas)
    expect(h.presas).toHaveLength(1)
    await agir(() => ctx().selectLayers(GRADE))
    await cancelarAplicacao()
    await agir(() => h.presas.splice(0).forEach((r) => r()))
    expect(controle()).toHaveLength(0)
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, '', '', ''])
    expect(ctx().canUndo).toBe(false)
    expect(botaoAdicionar().props.disabled).toBeFalsy()

    h.segurar = false
    await adicionarDaBiblioteca()
    expect(camada('d1').fileUrl).toBe(BIB)
  })

  it('grade CHEIA + "+" armado: avulsa comum, sem clipe, e o "+" continua armado', async () => {
    await abrir(design([...doisPorDois([A, A, A, A]), texto]))
    await agir(() => ctx().selectLayers(GRADE))
    armarInsercaoDeClipe()
    const antes = ctx().design.layers.length
    await adicionarDaBiblioteca()
    expect(ctx().design.layers).toHaveLength(antes + 1)
    expect(ctx().design.layers.some((l) => (l as { clipe?: unknown }).clipe)).toBe(false)
    expect(consumirInsercaoDeClipe()).toBe(true)
  })
})

describe('G2 · painel IA: geração', () => {
  async function gerar() {
    // o painel lê `window.location.origin` ao montar as referências (sem isso a geração para num toast de erro)
    vi.stubGlobal('window', { location: { origin: 'http://localhost', href: 'http://localhost/' } })
    const campo = achar((n) => n.type === 'textarea' && n.props.placeholder === 'Descreva a imagem que deseja gerar...')
    await agir(() => (campo.props.onChange as (e: unknown) => void)({ target: { value: 'picanha na tábua' } }))
    await agir(() => (botaoGerar().props.onClick as () => void)())
    expect(h.geracoes).toHaveLength(1)
  }
  const responder = () => agir(() => h.geracoes[0]({ fileUrl: GEROU, name: 'gerada.png', width: 1080, height: 1350 }))

  it('o alvo é decidido ANTES de gerar: trocar a seleção durante a geração não desvia a foto; durante a aplicação, gerar fica bloqueado e há Cancelar', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    await agir(() => ctx().selectLayers(GRADE))
    await gerar()
    await agir(() => ctx().selectLayers(['titulo'])) // seleção muda no meio da geração
    h.segurar = true
    await responder()
    expect(controle()).toHaveLength(1)
    expect(botaoGerar().props.disabled).toBe(true)
    await agir(() => h.presas.splice(0).forEach((r) => r()))
    expect(camada('d1').fileUrl).toBe(GEROU)
    expect(ctx().design.layers.filter((l) => l.fileUrl === GEROU)).toHaveLength(1) // nenhuma avulsa
    expect(controle()).toHaveLength(0)
  })

  it('grade CHEIA + "+" armado: a gerada entra avulsa sem clipe e o "+" continua armado', async () => {
    await abrir(design([...doisPorDois([A, A, A, A]), texto]))
    await agir(() => ctx().selectLayers(GRADE))
    armarInsercaoDeClipe()
    await gerar()
    await responder()
    expect(ctx().design.layers.filter((l) => l.fileUrl === GEROU)).toHaveLength(1)
    expect(ctx().design.layers.some((l) => (l as { clipe?: unknown }).clipe)).toBe(false)
    expect(consumirInsercaoDeClipe()).toBe(true)
  })
})
