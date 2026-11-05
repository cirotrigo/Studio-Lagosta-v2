/**
 * G2 · LIGAÇÃO do painel Imagens real (`ImagesPanelContent`) com o preenchimento, no host sem DOM do G1. Os
 * providers e o painel são reais; o elemento-raiz do teste recebe `ref` e o host devolve a própria instância, então a
 * árvore é percorrida e os `onClick`/`onChange`/`onSubmit` são CHAMADOS direto nas props — não é clique de navegador.
 * Dublês: `use-pages`, `use-project`, `use-acervo`, `use-aprendizado`, upload do Blob, medidor, toast, `next/image`, as
 * abas (Radix precisa de DOM) e a REDE (`fetch` responde só as rotas abaixo e recusa o resto).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  toasts: [] as Array<{ description?: string; variant?: string }>,
  enviados: [] as string[],
  sinais: [] as unknown[],
  falhaNoDrive: new Set<string>(),
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-project', () => ({ useProject: () => ({ data: { googleDriveImagesFolderId: 'pasta', googleDriveImagesFolderName: 'Fotos' } }) }))
vi.mock('@/hooks/use-aprendizado', () => ({ useAprendizado: () => ({ registrarDesfecho: (x: unknown) => void h.sinais.push(x) }) }))
// Cada busca é uma lista ranqueada com o seu sinal (S1: K no topo, L; S2: J no topo)
vi.mock('@/hooks/use-acervo', () => {
  const foto = (id: string) => ({ driveFileId: id, fileName: `${id.toLowerCase()}.jpg`, folder: 'Fotos', menuItem: null, ultimoUso: 'nunca' })
  const listas: Record<string, unknown> = {
    picanha: { images: [foto('K'), foto('L')], total: 2, sugestaoId: 'S1', propostaTopo: 'K' },
    chopp: { images: [foto('J')], total: 1, sugestaoId: 'S2', propostaTopo: 'J' },
  }
  return { useAcervo: (_p: number, f: { tema?: string; enabled?: boolean }) => ({ data: f.enabled ? listas[f.tema ?? ''] : undefined, isLoading: false, isFetching: false }) }
})
vi.mock('@/hooks/use-blob-upload', () => ({
  useBlobUpload: () => ({ upload: async (f: File) => (h.enviados.push(f.name), `https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/up/${f.name}`), isUploading: false }),
}))
vi.mock('@/lib/grades/medir-foto', () => ({ medirFotoNoNavegador: async (url: string) => ({ src: url, width: 1600, height: 1200 }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { description?: string; variant?: string }) => void h.toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/components/ui/tabs', () => {
  const caixa = ({ children }: { children?: React.ReactNode }) => React.createElement('caixa', null, children)
  return { Tabs: caixa, TabsList: caixa, TabsTrigger: caixa, TabsContent: caixa }
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { ImagesPanelContent } from '@/components/templates/panels/images-panel'
import { armarInsercaoDeClipe, consumirInsercaoDeClipe, desarmarInsercaoDeClipe } from '@/lib/video/insercao-de-clipe'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const GRADE = ['d0', 'd1', 'd2', 'd3']
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const design = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers }) as DesignData

// ── Rede ────────────────────────────────────────────────────────────────────
const chamadas: Array<{ url: string; corpo?: unknown }> = []
const resposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })
function redeFalsa() {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const corpo = init.body ? JSON.parse(String(init.body)) : undefined
    chamadas.push({ url, corpo })
    if (url.startsWith('/api/google-drive/files?')) {
      return resposta({ items: ['A', 'B', 'C'].map((id) => ({ id, name: `${id.toLowerCase()}.jpg`, kind: 'file', mimeType: 'image/jpeg' })) })
    }
    if (url === '/api/upload/google-drive') return resposta({ url: `${BLOB}/avulsa/${corpo.fileId}.jpg`, name: `${corpo.fileId}.jpg` })
    if (url === '/api/google-drive-download') {
      const ids = (corpo.fileIds as string[]).filter((id) => !h.falhaNoDrive.has(id))
      return resposta({ files: ids.map((id) => ({ id, url: `${BLOB}/drive/${id}.jpg`, name: `${id}.jpg` })) })
    }
    throw new Error(`rede bloqueada no teste: ${url}`)
  })
}

// ── Árvore ──────────────────────────────────────────────────────────────────
type No = { type: string; props: Record<string, unknown>; filhos: unknown[] }
const raiz: { atual: No | null } = { atual: null }
const sonda: { ctx: TemplateEditorContextValue | null } = { ctx: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  return null
}
const ctx = () => sonda.ctx!
function nos(no: unknown = raiz.atual): No[] {
  if (!no || typeof no !== 'object' || !('filhos' in no)) return []
  const n = no as No
  return [n, ...n.filhos.flatMap((f) => nos(f))]
}
const textoDe = (no: unknown): string =>
  no && typeof no === 'object' ? ('texto' in no ? String((no as { texto: string }).texto) : 'filhos' in no ? (no as No).filhos.map(textoDe).join('') : '') : ''
const achar = (f: (n: No) => boolean) => {
  const n = nos().find(f)
  if (!n) throw new Error('nó não encontrado')
  return n
}
const tile = (titulo: string) => achar((n) => n.type === 'button' && n.props.title === titulo)
const rotulado = (rotulo: string) => achar((n) => n.type === 'button' && n.props['aria-label'] === rotulo)
const correr = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}
const agir = (f: () => unknown) =>
  emAct(async () => {
    f()
    await correr()
  })
const camada = (id: string) => ctx().design.layers.find((l) => l.id === id)!

let desmontar: (() => Promise<void>) | null = null
async function abrir(d: DesignData) {
  h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1350, layers: d.layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
  redeFalsa()
  const t: TemplateResource = { id: 1, name: 'T', type: 'FEED', dimensions: '1080x1350', designData: d, dynamicFields: [], projectId: 5 }
  const arvore = React.createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    React.createElement(
      MultiPageProvider,
      { templateId: 1, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
      React.createElement(
        TemplateEditorProvider,
        { template: t } as React.ComponentProps<typeof TemplateEditorProvider>,
        React.createElement('raiz-do-teste', { ref: (n: No | null) => void (raiz.atual = n) }, React.createElement(ImagesPanelContent), React.createElement(Sonda)),
      ),
    ),
  )
  const m = await montar(arvore)
  desmontar = m.desmontar
  await emAct(correr) // a lista da pasta do Drive carrega no mount
}
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  chamadas.length = 0
  h.toasts.length = 0
  h.enviados.length = 0
  h.sinais.length = 0
  h.falhaNoDrive.clear()
  desarmarInsercaoDeClipe()
  vi.unstubAllGlobals()
})

const rotas = () => chamadas.map((c) => c.url).filter((u) => !u.startsWith('/api/google-drive/files'))
async function buscar(tema: string) {
  const campo = achar((n) => n.type === 'input' && n.props.placeholder === 'Buscar: picanha, happy hour…')
  await agir(() => (campo.props.onChange as (e: unknown) => void)({ target: { value: tema } }))
  await agir(() => (achar((n) => n.type === 'form').props.onSubmit as (e: unknown) => void)({ preventDefault: () => undefined }))
}
const tocar = (titulo: string) => agir(() => (tile(titulo).props.onClick as () => void)())
const doAcervo = (id: string) => `${id.toLowerCase()}.jpg · Fotos · nunca usada`

describe('G2 · painel Imagens: cada entrada converge no mesmo contrato', () => {
  it('sem grade selecionada: tile do Drive segue a avulsa de sempre (rota antiga, addLayer)', async () => {
    await abrir(design([...doisPorDois(['', '', '', '']), texto]))
    const antes = ctx().design.layers.length
    await agir(() => (tile('a.jpg').props.onClick as () => void)())
    expect(rotas()).toEqual(['/api/upload/google-drive'])
    expect(ctx().design.layers).toHaveLength(antes + 1)
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual(['', '', '', ''])
  })

  it('grade inteira selecionada: tile do Drive vai pela rota do PROJETO para a próxima célula vazia, sem camada nova', async () => {
    await abrir(design([...doisPorDois([A, '', '', '']), texto]))
    await agir(() => ctx().selectLayers(GRADE))
    expect(textoDe(achar((n) => n.props['data-barra'] === 'lote-da-grade'))).toMatch(/primeira célula vazia \(3 vazias\)/)
    const antes = ctx().design.layers.length
    await agir(() => (tile('b.jpg').props.onClick as () => void)())
    expect(chamadas.filter((c) => c.url === '/api/google-drive-download').map((c) => c.corpo)).toEqual([{ projectId: 5, fileIds: ['B'] }])
    expect(rotas()).not.toContain('/api/upload/google-drive')
    expect(camada('d1').fileUrl).toBe(`${BLOB}/drive/B.jpg`)
    expect(ctx().design.layers).toHaveLength(antes)
  })

  it('acervo (busca) com célula selecionada: substitui a foto dela pela rota do projeto', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await agir(() => ctx().selectLayers(['d0']))
    const campo = achar((n) => n.type === 'input' && n.props.placeholder === 'Buscar: picanha, happy hour…')
    await agir(() => (campo.props.onChange as (e: unknown) => void)({ target: { value: 'picanha' } }))
    await agir(() => (achar((n) => n.type === 'form').props.onSubmit as (e: unknown) => void)({ preventDefault: () => undefined }))
    await agir(() => (tile('k.jpg · Fotos · nunca usada').props.onClick as () => void)())
    expect(chamadas.find((c) => c.url === '/api/google-drive-download')?.corpo).toEqual({ projectId: 5, fileIds: ['K'] })
    expect(camada('d0').fileUrl).toBe(`${BLOB}/drive/K.jpg`)
    expect(h.sinais).toEqual([{ sugestaoId: 'S1', desfecho: 'aceita-como-veio', escolhido: { driveFileId: 'K', posicao: 1 } }])
  })

  it('upload do computador com grade selecionada: sobe pelo Blob e entra na próxima célula vazia', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await agir(() => ctx().selectLayers(GRADE))
    const entrada = achar((n) => n.type === 'input' && n.props.type === 'file' && !n.props.multiple)
    await agir(() => (entrada.props.onChange as (e: unknown) => void)({ target: { files: [new File(['x'], 'meu.jpg', { type: 'image/jpeg' })], value: '' } }))
    expect(h.enviados).toEqual(['meu.jpg'])
    expect(camada('d1').fileUrl).toMatch(/\/up\/meu\.jpg$/)
    expect(rotas()).toEqual([])
  })

  it('lote: "Preencher com várias fotos", toques em B e depois A (selos 1 e 2), "Preencher" ⇒ UM pedido [B, A] e as células vazias em ordem', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await agir(() => ctx().selectLayers(GRADE))
    await agir(() => (rotulado('Preencher com várias fotos').props.onClick as () => void)())
    await agir(() => (tile('b.jpg').props.onClick as () => void)())
    await agir(() => (tile('a.jpg').props.onClick as () => void)())
    expect(rotas()).toEqual([]) // nada baixado antes de "Preencher"
    expect([textoDe(tile('b.jpg')), textoDe(tile('a.jpg'))].map((t) => t.match(/^\d/)?.[0])).toEqual(['1', '2'])
    await agir(() => (rotulado('Preencher as células').props.onClick as () => void)())
    expect(chamadas.filter((c) => c.url === '/api/google-drive-download').map((c) => c.corpo)).toEqual([{ projectId: 5, fileIds: ['B', 'A'] }])
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, `${BLOB}/drive/B.jpg`, `${BLOB}/drive/A.jpg`, ''])
    expect(nos().some((n) => n.props?.['data-escolha'])).toBe(false) // lote fechado depois do sucesso
    await emAct(() => ctx().undo())
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, '', '', ''])
  })
})

describe('G2 · painel Imagens: grade cheia e o "+" da linha do tempo', () => {
  it('grade CHEIA + "+" armado: o tile do Drive entra AVULSO pela rota de sempre, sem clipe, e o "+" continua armado', async () => {
    await abrir(design([...doisPorDois([A, A, A, A]), texto]))
    await agir(() => ctx().selectLayers(GRADE))
    armarInsercaoDeClipe()
    const antes = ctx().design.layers.length
    await tocar('b.jpg')
    expect(rotas()).toEqual(['/api/upload/google-drive'])
    expect(ctx().design.layers).toHaveLength(antes + 1)
    const nova = ctx().design.layers.find((l) => l.fileUrl === `${BLOB}/avulsa/B.jpg`)!
    expect(nova.metadata).toBeUndefined()
    expect(ctx().design.layers.some((l) => (l as { clipe?: unknown }).clipe)).toBe(false)
    expect(consumirInsercaoDeClipe()).toBe(true)
  })

  it('SEM grade + "+" armado: legado intacto (a avulsa de sempre consome o "+")', async () => {
    await abrir(design([...doisPorDois(['', '', '', '']), texto]))
    armarInsercaoDeClipe()
    await tocar('b.jpg')
    expect(rotas()).toEqual(['/api/upload/google-drive'])
    expect(consumirInsercaoDeClipe()).toBe(false)
  })
})

describe('G2 · painel Imagens: o sinal do acervo só sai quando a foto é de fato aplicada', () => {
  it('lote: tocar, lote cheio, retirar e cancelar NÃO emitem sinal', async () => {
    await abrir(design(doisPorDois([A, A, A, ''])))
    await agir(() => ctx().selectLayers(GRADE))
    await agir(() => (rotulado('Preencher com várias fotos').props.onClick as () => void)())
    await buscar('picanha')
    await tocar(doAcervo('K')) // entra (limite 1)
    await tocar(doAcervo('L')) // lote cheio: ignorado
    await tocar(doAcervo('K')) // retirada
    await tocar(doAcervo('K')) // de novo
    await agir(() => (rotulado('Cancelar').props.onClick as () => void)())
    expect(h.sinais).toEqual([])
    expect(rotas()).toEqual([])
  })

  it('lote parcial: só a foto APLICADA vira sinal, com a busca de onde ela foi escolhida (não a busca aberta agora)', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await agir(() => ctx().selectLayers(GRADE))
    await agir(() => (rotulado('Preencher com várias fotos').props.onClick as () => void)())
    await buscar('picanha')
    await tocar(doAcervo('L')) // S1, segunda da lista
    await buscar('chopp')
    await tocar(doAcervo('J')) // S2
    h.falhaNoDrive.add('J')
    await agir(() => (rotulado('Preencher as células').props.onClick as () => void)())
    expect(chamadas.filter((c) => c.url === '/api/google-drive-download').map((c) => c.corpo)).toEqual([{ projectId: 5, fileIds: ['L', 'J'] }])
    expect(GRADE.map((id) => camada(id).fileUrl)).toEqual([A, `${BLOB}/drive/L.jpg`, '', ''])
    expect(h.sinais).toEqual([{ sugestaoId: 'S1', desfecho: 'trocada', escolhido: { driveFileId: 'L', posicao: 2 } }])
  })

  it('foto única do acervo para a grade que NÃO entrou (Drive sem o arquivo): nenhum sinal', async () => {
    await abrir(design(doisPorDois([A, '', '', ''])))
    await agir(() => ctx().selectLayers(['d0']))
    await buscar('picanha')
    h.falhaNoDrive.add('K')
    await tocar(doAcervo('K'))
    expect(camada('d0').fileUrl).toBe(A)
    expect(h.sinais).toEqual([])
  })

  it('sem grade (avulsa): o sinal sai no clique, como sempre', async () => {
    await abrir(design([texto]))
    await buscar('picanha')
    await tocar(doAcervo('K'))
    expect(h.sinais).toEqual([{ sugestaoId: 'S1', desfecho: 'aceita-como-veio', escolhido: { driveFileId: 'K', posicao: 1 } }])
    expect(rotas()).toEqual(['/api/upload/google-drive'])
  })
})
