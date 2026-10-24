/**
 * Harness do CP-X2b: substitui `@/contexts/multi-page-context` e `@/contexts/template-editor-context` no bundle (o
 * spec redireciona os dois para cá). O resto — `PageSyncWrapper`, a fila, as recusas e o `ShapeControls` — é o
 * código REAL. O "servidor" roda a MESMA guarda das rotas (`exigirVetoresValidos`) e responde como o `api-client`:
 * erro com `status` e a mensagem do `error` do 422. Sem rede, login, banco ou Blob.
 */
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'
import { VetorInvalido } from '@/lib/vetor/validar-camada'
import { corpoDoVetorInvalido, exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'

export interface PageStatePatch {
  layers?: unknown[]
  width?: number
  height?: number
  background?: string
  audio?: Page['audio'] | null
  thumbnail?: null
}

export interface EnvioRegistrado {
  pageId: string
  campos: string[]
  status: number
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** O servidor de mentira, fora do React: a fonte da verdade do que está "gravado". */
export const servidor: { paginas: Map<string, Page>; envios: EnvioRegistrado[]; lista: () => Page[] } = {
  paginas: new Map<string, Page>(),
  envios: [],
  lista: () => Array.from(servidor.paginas.values()).map((p) => clone(p)).sort((a, b) => a.order - b.order),
}

type MultiPage = {
  pages: Page[]
  currentPageId: string | null
  currentPage: Page | null
  setCurrentPageId: (id: string) => void
  savePageState: (pageId: string, data: PageStatePatch) => Promise<void>
  updatePageThumbnail: (pageId: string, thumbnail: string) => Promise<void>
}
type Editor = {
  design: DesignData
  loadTemplate: (p: { designData: DesignData; markDirty?: boolean; historyKey?: string }) => void
  generateThumbnail: (largura: number) => Promise<string | null>
}

const MultiPageContext = React.createContext<MultiPage | null>(null)
const EditorContext = React.createContext<Editor | null>(null)
/** O painel (`BrandColorSwatches`, `ColorPicker`) lê o contexto direto e tolera ausência: aqui ele fica vazio. */
export const TemplateEditorContext = React.createContext<{ projectId?: number } | null>(null)

export function useMultiPage(): MultiPage {
  return React.useContext(MultiPageContext)!
}
export function useMultiPageOpcional(): MultiPage | null {
  return React.useContext(MultiPageContext)
}
/**
 * CP-V3: o campo isolado (`window.__campo`, fora da `Bancada`) monta o `ShapeControls`, que passou a ler projeto,
 * template, design, seleção e a geração da carga do editor. Fora da `Bancada`, um editor mínimo SEM projeto:
 * `projectId` NaN desliga as consultas da marca (`useBrandColorsEstrita` e `useProject`), e nada é gravado por ele.
 * Dentro da `Bancada` (o `PageSyncWrapper`), continua o contexto de sempre.
 */
const EDITOR_DO_CAMPO = {
  projectId: Number.NaN,
  templateId: 0,
  design: { canvas: { width: 1080, height: 1920 }, layers: [] },
  selectedLayerIds: [],
  geracaoDaCarga: () => 0,
  updateLayer: () => {},
}
export function useTemplateEditor(): Editor {
  return React.useContext(EditorContext) ?? (EDITOR_DO_CAMPO as unknown as Editor)
}

export interface ApiDaBancada {
  editarCamadas: (layers: Layer[]) => void
  mudarFundo: (cor: string) => void
  trocarPagina: (id: string) => void
  design: () => DesignData
}

export function Bancada({ inicial, aoPronto, children }: { inicial: string; aoPronto: (api: ApiDaBancada) => void; children: React.ReactNode }) {
  const [pages, setPages] = React.useState<Page[]>(() => servidor.lista())
  const [currentPageId, setCurrentPageId] = React.useState<string | null>(inicial)
  const [design, setDesign] = React.useState<DesignData>({ canvas: { width: 1080, height: 1920, backgroundColor: '#ffffff' }, layers: [] })
  const designRef = React.useRef(design)
  designRef.current = design

  const savePageState = React.useCallback(async (pageId: string, data: PageStatePatch) => {
    await new Promise((r) => setTimeout(r, 30))
    const campos = Object.keys(data)
    try {
      if (data.layers !== undefined) exigirVetoresValidos(data.layers)
    } catch (erro) {
      if (!(erro instanceof VetorInvalido)) throw erro
      servidor.envios.push({ pageId, campos, status: 422 })
      throw Object.assign(new Error(corpoDoVetorInvalido(erro).error), { name: 'ApiError', status: 422 })
    }
    servidor.envios.push({ pageId, campos, status: 200 })
    const atual = servidor.paginas.get(pageId)!
    servidor.paginas.set(pageId, {
      ...atual,
      ...(data.layers !== undefined ? { layers: clone(data.layers) as Layer[] } : {}),
      ...(data.width !== undefined ? { width: data.width } : {}),
      ...(data.height !== undefined ? { height: data.height } : {}),
      ...(data.background !== undefined ? { background: data.background } : {}),
      ...(data.audio !== undefined ? { audio: data.audio } : {}),
    })
    setPages(servidor.lista())
  }, [])
  const updatePageThumbnail = React.useCallback(async () => {}, [])
  const loadTemplate = React.useCallback((p: { designData: DesignData }) => setDesign(clone(p.designData)), [])
  const generateThumbnail = React.useCallback(async () => 'data:image/png;base64,AAAA', [])

  const currentPage = React.useMemo(() => pages.find((p) => p.id === currentPageId) ?? null, [pages, currentPageId])
  const multi = React.useMemo<MultiPage>(
    () => ({ pages, currentPageId, currentPage, setCurrentPageId, savePageState, updatePageThumbnail }),
    [pages, currentPageId, currentPage, savePageState, updatePageThumbnail],
  )
  const editor = React.useMemo<Editor>(() => ({ design, loadTemplate, generateThumbnail }), [design, loadTemplate, generateThumbnail])

  React.useEffect(() => {
    aoPronto({
      editarCamadas: (layers) => setDesign((d) => ({ ...d, layers: clone(layers) })),
      mudarFundo: (cor) => setDesign((d) => ({ ...d, canvas: { ...d.canvas, backgroundColor: cor } })),
      trocarPagina: (id) => setCurrentPageId(id),
      design: () => clone(designRef.current),
    })
  }, [aoPronto])

  return (
    <MultiPageContext.Provider value={multi}>
      <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
    </MultiPageContext.Provider>
  )
}
