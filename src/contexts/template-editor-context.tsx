"use client"

import * as React from 'react'
import type { DesignData, DynamicField, Layer } from '@/types/template'
import type Konva from 'konva'
import type { AlignAxis, AlignMode } from '@/lib/konva-alignment'
import { FONT_CONFIG } from '@/lib/font-config'
import { aplicarGradienteSuave, ID_GRADIENTE_SUAVE } from '@/lib/creatives/gradiente-suave'
import { createId } from '@/lib/id'
import { camadaDuplicadaNoEditor, camadasColadasNoEditor, paginaTemContrato } from '@/lib/copy-autoral/camada-copiada'
import { useMultiPageOpcional } from '@/contexts/multi-page-context'
import { relogioDaPagina } from '@/lib/video/relogio-da-pagina'
import { mesmaEntradaDeDesfazer } from '@/lib/historico-do-editor'
import { duracoesDosVideosMontados, videosProntosEmZero } from '@/lib/video/videos-montados'
import { aplicarQuadro } from '@/lib/video/aplicar-quadro'
import { ehClipe } from '@/lib/video/camadas-de-video'
import { criarReservaDeClipes, inserirClipe, MENSAGEM_TETO_DE_CLIPES, normalizarClipes } from '@/lib/video/linha-do-tempo'
import { toast } from '@/hooks/use-toast'
import { consumirInsercaoDeClipe } from '@/lib/video/insercao-de-clipe'
import { criarGeracaoDaCarga } from '@/lib/editor/cores-da-forma'
import { useQueryClient } from '@tanstack/react-query'
import { canonicalizeShapeStyleForPersistence } from '@/lib/shape-style'
import { dimensoesDaFotoCarregada } from '@/lib/image-fit'
import { layoutDoCatalogo, VERSAO_DO_CATALOGO } from '@/lib/grades/catalogo'
import { fundoParaMedir, inserirGradeNoDesign, MENSAGEM_ALVO_MUDOU, type DesfechoDaInsercao, type MedidaDoFundo } from '@/lib/grades/insercao'
import {
  MENSAGEM_ALVO_MUDOU as MENSAGEM_LOTE_FORA_DO_ALVO,
  fotoAvulsaLimpa,
  planoDePreenchimento,
  preencherNoDesign,
  recusaDoPreenchimento,
  type AlvoDePreenchimento,
  type DesfechoDoPreenchimento,
  type FalhaDaFoto,
  type FotoParaCelula,
  type PlanoDePreenchimento,
} from '@/lib/grades/preenchimento'
import {
  MENSAGEM_AJUSTE_FORA_DO_ALVO,
  MENSAGEM_ALINHAR_GRADE,
  ajustarGradeNoDesign,
  desvincularNoDesign,
  moverNoDesign,
  planoDoAjuste,
  selecaoTocaGrade,
  type AlvoDoAjuste,
  type DesfechoDoAjuste,
  type PlanoDoAjuste,
} from '@/lib/grades/ajustes'
import type { MudancaDeGrade } from '@/lib/grades/operacoes'
import { metadadoDeGrade } from '@/lib/grades/conferir'
import { membrosDaGrade } from '@/lib/grades/preenchimento'
import {
  MENSAGEM_AGRUPAR_GRADE,
  agruparTocaGrade,
  desagruparNoDesign,
  duplicarGradeNoDesign,
  edicaoDaCamada,
  removerNoDesign,
  semVinculoDeGrade,
  vinculadaAGrade,
} from '@/lib/grades/no-editor'

export interface TemplateResource {
  id: number
  name: string
  type: string
  dimensions: string
  designData: DesignData
  dynamicFields: DynamicField[] | null
  projectId: number
  updatedAt?: string
}

export interface TemplateEditorContextValue {
  templateId: number
  projectId: number
  name: string
  setName: (name: string) => void
  type: string
  dimensions: string
  design: DesignData
  setDesign: React.Dispatch<React.SetStateAction<DesignData>>
  selectedLayerIds: string[]
  selectedLayerId: string | null
  selectLayer: (id: string | null, options?: { additive?: boolean; toggle?: boolean }) => void
  selectLayers: (ids: string[]) => void
  toggleLayerSelection: (id: string) => void
  clearLayerSelection: () => void
  /** Agrupa a seleção (2+ camadas) num grupo estilo Canva: `metadata.groupId` comum */
  groupSelectedLayers: () => void
  /** Desfaz o(s) grupo(s) a que as camadas pertencem (sem `ids`, a seleção) — nada é desselecionado */
  ungroupLayers: (ids?: string[]) => void
  updateLayer: (
    id: string,
    updater: (layer: Layer) => Layer,
    /**
     * `gesto`: a mesma `coalesceKey` vira UMA entrada de desfazer pelo gesto
     * inteiro, sem a janela de 800 ms. Desfazer/refazer no meio zera a chave,
     * então a escrita seguinte abre entrada nova (e descarta o refazer velho).
     */
    options?: { coalesceKey?: string; gesto?: boolean },
  ) => void
  updateLayerPartial: (id: string, partial: Partial<Layer>) => void
  updateLayerStyle: (id: string, style: Layer['style']) => void
  moveLayer: (id: string, deltaX: number, deltaY: number) => void
  addLayer: (layer: Layer) => void
  /**
   * G1: insere uma grade do catálogo como N camadas `image` num `applyDesign` só (um desfazer), sem o desvio de clipe
   * do `addLayer`. O fundo único elegível vira a célula 1 depois de `medirFoto` (dimensão conferida pela URL exata);
   * página, template/projeto, geração da carga e impressão do fundo/canvas são conferidos de novo DENTRO do
   * `applyDesign`. Página de vídeo é recusada sem tocar design nem histórico. Ver `src/lib/grades/insercao.ts`.
   */
  inserirGrade: (
    layout: string,
    opcoes: { medirFoto: (url: string) => Promise<{ src: string; width: number; height: number } | undefined> },
  ) => Promise<DesfechoDaInsercao>
  /**
   * G2: onde a(s) próxima(s) foto(s) entram, decidido AGORA (seleção, design, página, documento e geração da carga
   * deste instante), antes de qualquer upload, download ou geração. `'uma'`: grade inteira → próxima célula vazia;
   * célula → substitui; grade cheia ou sem grade → avulsa pelo caminho de sempre. Número: lote para a grade inteira.
   * Ver `src/lib/grades/preenchimento.ts`.
   */
  planejarPreenchimento: (quantas: 'uma' | number) => PlanoDePreenchimento
  /**
   * G2: aplica fotos já baixadas e medidas nas células do plano num `applyDesign` só (um desfazer), sem `addLayer` e
   * sem o "+" da linha do tempo. Página, documento, geração e a assinatura de TODOS os membros da grade são conferidos
   * DENTRO do updater, sobre o estado atual: mudou ⇒ nada aplicado. Foto que falhou deixa a célula como estava.
   * `cancelado` também é lido DENTRO do updater: cancelado antes de ele rodar ⇒ `prev`, sem histórico nem dirty.
   */
  preencherGrade: (
    alvo: AlvoDePreenchimento,
    fotos: FotoParaCelula[],
    falhas?: FalhaDaFoto[],
    cancelado?: AbortSignal,
  ) => Promise<DesfechoDoPreenchimento>
  /**
   * G2: a foto que a grade CHEIA manda avulsa — `image` comum no topo, um desfazer, SEM o desvio de clipe do `addLayer`
   * (o "+" armado da linha do tempo continua armado) e sem metadado, grupo ou clipe herdados. Sem grade, é o `addLayer`.
   */
  adicionarFotoAvulsa: (camada: Layer) => void
  /**
   * G3: alvo de um ajuste da grade (espaçamento, cantos, caixa, layout) decidido AGORA, antes de medir as fotos: grade,
   * assinatura de todos os membros, URLs a medir, página, documento e geração. Ver `src/lib/grades/ajustes.ts`.
   */
  planejarAjusteDaGrade: (gradeId: string) => PlanoDoAjuste
  /**
   * G3: aplica a mudança num `applyDesign` só (um desfazer) pelo `refazerGrade` do G0, com as medidas por URL exata.
   * Cancelamento, página, documento, geração e assinatura são conferidos DENTRO do updater: mudou ⇒ `prev` intacto.
   * Seleciona a grade (ou as fotos que sobraram avulsas).
   */
  aplicarAjusteDaGrade: (
    alvo: AlvoDoAjuste,
    mudanca: MudancaDeGrade,
    dimensoes: ReadonlyMap<string, { width: number; height: number }>,
    cancelado?: AbortSignal,
  ) => Promise<DesfechoDoAjuste>
  /**
   * G3: move `ids` por (dx, dy) num `applyDesign`: grade tocada anda INTEIRA (caixa + células, translação pura), as
   * outras como no `moveLayer`. `coalesceKey` só para as setas (a janela de 800 ms de sempre); arraste, sem chave.
   */
  moverSelecao: (ids: string[], dx: number, dy: number, opcoes?: { coalesceKey?: string }) => Promise<DesfechoDoAjuste>
  /** G3: "Desvincular da grade" — `grade` e o `groupId` dela saem de todos os membros num desfazer; fotos e recortes ficam */
  desvincularGrade: (gradeId: string) => Promise<DesfechoDoAjuste>
  applySoftTopGradient: () => void
  duplicateLayer: (id: string) => void
  removeLayer: (id: string) => void
  /** Exclui várias camadas numa operação só (um desfazer): a seleção do Delete, do botão de excluir e do painel */
  removeLayers: (ids: string[]) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  reorderLayers: (idsInOrder: string[]) => void
  updateCanvas: (canvas: Partial<DesignData['canvas']>) => void
  /** Trilha sonora da página (persistida em Page.audio via PageSync); null limpa. */
  setPageAudio: (audio: DesignData['audio']) => void
  dynamicFields: DynamicField[]
  setDynamicFields: React.Dispatch<React.SetStateAction<DynamicField[]>>
  dirty: boolean
  /**
   * Geração da carga do documento (CP-V3): sobe em toda `loadTemplate` e na troca de template/projeto do provider;
   * não sobe em edição nem com um novo objeto do mesmo template. Só leitura (o Reaplicar confere o alvo por ela).
   */
  geracaoDaCarga: () => number
  markSaved: (nextTemplate?: Partial<TemplateResource>) => void
  zoom: number
  setZoom: (value: number) => void
  /** Escurece camadas não-texto para avaliar a tipografia sem a foto distraindo */
  focusTextMode: boolean
  setFocusTextMode: (value: boolean) => void
  zoomIn: () => void
  zoomOut: () => void
  copySelectedLayers: () => void
  pasteLayers: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  isExporting: boolean
  exportHistory: ExportRecord[]
  generateThumbnail: (maxWidth?: number) => Promise<string | null>
  /** Export the current stage as a data URL without uploading. Same quality as exportDesign. */
  exportStageDataUrl: (format?: 'png' | 'jpeg') => Promise<string>
  exportDesign: (format: 'png' | 'jpeg', pageName?: string) => Promise<ExportRecord>
  removeExport: (id: string) => void
  clearExports: () => void
  setStageInstance: (stage: Konva.Stage | null) => void
  /**
   * Stage ATIVO (o único editável). Com o workspace contínuo existem N stages
   * montados (previews) — nunca localizar o stage por querySelector/Konva.stages;
   * esta é a fonte da verdade.
   */
  getStageInstance: () => Konva.Stage | null
  loadTemplate: (payload: {
    designData: DesignData
    dynamicFields?: DynamicField[] | null
    name?: string
    markDirty?: boolean
    historyKey?: string
  }) => void
  forceUpdate?: () => void
  // Alignment & Organization
  alignSelectedLeft: () => void
  alignSelectedCenterH: () => void
  alignSelectedRight: () => void
  alignSelectedTop: () => void
  alignSelectedMiddleV: () => void
  alignSelectedBottom: () => void
  distributeSelectedH: () => void
  distributeSelectedV: () => void
  bringSelectedToFront: () => void
  sendSelectedToBack: () => void
  moveSelectedForward: () => void
  moveSelectedBackward: () => void
  // Canvas Alignment
  alignSelectedToCanvasCenterH: () => void
  alignSelectedToCanvasCenterV: () => void
  // AI Image Edit Integration
  /** Camada de imagem em modo de recorte in-canvas (null = fora do modo) */
  croppingLayerId: string | null
  setCroppingLayerId: (id: string | null) => void
  pendingAIImageEdit: {
    url: string
    name: string
    driveFileId?: string      // ID do arquivo original no Drive
    driveFolderId?: string    // Pasta onde salvar resultado
  } | null
  setPendingAIImageEdit: (image: {
    url: string
    name: string
    driveFileId?: string
    driveFolderId?: string
  } | null) => void
}

export interface ExportRecord {
  id: string
  format: 'png' | 'jpeg'
  dataUrl: string
  width: number
  height: number
  fileName: string
  sizeBytes: number
  createdAt: number
  /**
   * Id da Generation criada no servidor. Necessário para enfileirar a melhoria
   * com IA logo após a geração — a rota de melhoria é
   * POST /api/generations/{id}/improve e exige uma Generation existente.
   */
  generationId?: string
  /** URL pública da arte no Blob, como o servidor gravou. */
  resultUrl?: string
}

export const TemplateEditorContext = React.createContext<TemplateEditorContextValue | null>(null)

// Detectar mobile para zoom inicial
const getDefaultZoom = () => {
  if (typeof window === 'undefined') return 0.3
  const isMobile = window.innerWidth <= 768
  return isMobile ? 0.25 : 0.3 // Mobile começa com 25%, desktop com 30%
}

const DEFAULT_ZOOM = getDefaultZoom()

interface TemplateEditorProviderProps {
  template: TemplateResource
  children: React.ReactNode
}

function normalizeLayerOrder(layers: Layer[]): Layer[] {
  // Toda escrita passa aqui: os clipes da linha do tempo ficam no bloco
  // contíguo do fundo (desmarcar um do meio, reordenar pelo painel Camadas,
  // trazer para frente) — uma camada solta entre clipes cobriria um e ficaria
  // atrás de outro. Página sem clipe: a ordem do array, como sempre.
  return normalizarClipes(layers.map((layer, idx) => ({ ...layer, order: idx })))
}

function cloneDesign(design: DesignData): DesignData {
  if (typeof structuredClone === 'function') {
    return structuredClone(design)
  }
  return JSON.parse(JSON.stringify(design)) as DesignData
}

export function TemplateEditorProvider({ template, children }: TemplateEditorProviderProps) {
  // C9-11: duplicar e colar só tiram o papel da cópia quando a página ABERTA tem contrato da copy.
  const multiPage = useMultiPageOpcional()
  const temCopyAutoral = paginaTemContrato(multiPage?.currentPage ?? null)
  const queryClient = useQueryClient()
  const [name, setName] = React.useState(template.name)
  const [design, setDesign] = React.useState<DesignData>(() => ({
    canvas: { ...template.designData.canvas },
    layers: normalizeLayerOrder(template.designData.layers ?? []),
  }))
  // Para as travas que precisam do design ANTES de mexer (teto de clipes) sem
  // recriar os callbacks a cada edição
  const designAtualRef = React.useRef(design)
  designAtualRef.current = design
  // G1: o alvo de uma inserção de grade que espera a medida da foto (conferido dentro do applyDesign)
  const paginaAtualRef = React.useRef<string | null>(null)
  paginaAtualRef.current = multiPage?.currentPageId ?? null
  const documentoAtualRef = React.useRef('')
  documentoAtualRef.current = `${template.id}:${template.projectId}`
  // CP-V3: carga e troca de documento sobem a geração; o mesmo template com objeto novo, não
  const geracaoRef = React.useRef<ReturnType<typeof criarGeracaoDaCarga> | null>(null)
  geracaoRef.current ??= criarGeracaoDaCarga(`${template.id}:${template.projectId}`)
  geracaoRef.current.documento(`${template.id}:${template.projectId}`)
  const geracaoDaCarga = React.useCallback(() => geracaoRef.current!.valor(), [])
  // Teto de clipes em lote: o `design` desta renderização já conta o que entrou
  const reservaDeClipesRef = React.useRef(criarReservaDeClipes())
  reservaDeClipesRef.current.zerar()
  const [dynamicFields, setDynamicFieldsState] = React.useState<DynamicField[]>(() =>
    Array.isArray(template.dynamicFields) ? [...template.dynamicFields] : [],
  )
// Começa sem seleção — evita toolbar contextual/lixeira armadas para uma camada que o usuário não escolheu
const [selectedLayerIds, setSelectedLayerIds] = React.useState<string[]>([])
const [dirty, setDirty] = React.useState(false)
// Zoom inicial depende do dispositivo
const [zoom, setZoomState] = React.useState(() => getDefaultZoom())
  const [focusTextMode, setFocusTextMode] = React.useState(false)
const [isExporting, setIsExporting] = React.useState(false)
const [exportHistory, setExportHistory] = React.useState<ExportRecord[]>([])
// Histórico POR PÁGINA: um mapa de pilhas chaveado por historyKey (pageId no
// editor multi-página). historyRef aponta para a entrada ativa — trocar de
// página troca o ponteiro em vez de zerar, então o undo sobrevive à navegação.
const historiesRef = React.useRef<Map<string, { past: DesignData[]; future: DesignData[] }>>(new Map())
const historyRef = React.useRef<{ past: DesignData[]; future: DesignData[] }>({ past: [], future: [] })
// Coalescing: gestos contínuos (digitação, slider, drag em grupo) empilham UM
// snapshot por gesto, não um por evento — senão os 50 níveis esvaziam rápido
const lastCoalesceRef = React.useRef<{ key: string | null; time: number }>({ key: null, time: 0 })
const [historyMeta, setHistoryMeta] = React.useState<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false })
const clipboardRef = React.useRef<Layer[] | null>(null)
const stageInstanceRef = React.useRef<Konva.Stage | null>(null)
const selectedLayerIdsRef = React.useRef<string[]>(selectedLayerIds)
/** G4.3: a última "duplicar a grade inteira" (seleção e grade) — o "duplicar seleção" chama uma vez por membro */
const ultimaGradeDuplicadaRef = React.useRef<{ selecao: string[] | null; gradeId: string | null }>({ selecao: null, gradeId: null })
const [, setUpdateCounter] = React.useState(0)
const [croppingLayerId, setCroppingLayerId] = React.useState<string | null>(null)
const [pendingAIImageEdit, setPendingAIImageEdit] = React.useState<{
  url: string
  name: string
  driveFileId?: string
  driveFolderId?: string
} | null>(null)

  // Keep ref in sync with state
  React.useEffect(() => {
    selectedLayerIdsRef.current = selectedLayerIds
  }, [selectedLayerIds])

  // Sync only when switching to ANOTHER template (id change).
  // Não resetar em refetch/save do mesmo template: no editor multi-página o design em memória
  // vem das Pages (via PageSync); repor template.designData aqui trocava o design por um
  // snapshot velho no meio da edição, e o autosave persistia isso na página atual.
  const lastSyncedTemplateIdRef = React.useRef(template.id)
  React.useEffect(() => {
    if (lastSyncedTemplateIdRef.current === template.id) {
      return
    }
    lastSyncedTemplateIdRef.current = template.id
    setName(template.name)
    setDesign({
      canvas: { ...template.designData.canvas },
      layers: normalizeLayerOrder(template.designData.layers ?? []),
    })
    setDynamicFieldsState(Array.isArray(template.dynamicFields) ? [...template.dynamicFields] : [])
    setSelectedLayerIds([])
    setDirty(false)
    setZoomState(DEFAULT_ZOOM)
    historiesRef.current.clear()
    historyRef.current = { past: [], future: [] }
    lastCoalesceRef.current = { key: null, time: 0 }
    setHistoryMeta({ canUndo: false, canRedo: false })
    setExportHistory([])
  }, [template.id, template.name, template.designData, template.dynamicFields])

  const updateHistoryMeta = React.useCallback(() => {
    setHistoryMeta({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    })
  }, [])

  const setZoom = React.useCallback((value: number) => {
    setZoomState(Math.min(2, Math.max(0.25, Number.isFinite(value) ? value : DEFAULT_ZOOM)))
  }, [])

  const zoomIn = React.useCallback(() => setZoomState((prev) => Math.min(prev + 0.1, 2)), [])
  const zoomOut = React.useCallback(() => setZoomState((prev) => Math.max(prev - 0.1, 0.25)), [])

  const setStageInstance = React.useCallback((stage: Konva.Stage | null) => {
    stageInstanceRef.current = stage
  }, [])

  const getStageInstance = React.useCallback(() => stageInstanceRef.current, [])

  const applyDesign = React.useCallback(
    (
      updater: (prev: DesignData) => DesignData,
      // skipHistory só pula o histórico; `markDirty: false` é a carga de página
      options?: { skipHistory?: boolean; coalesceKey?: string; gesto?: boolean; markDirty?: boolean },
    ) => {
      setDesign((prev) => {
        const next = updater(prev)
        if (next === prev) return prev
        if (options?.markDirty !== false) setDirty(true)
        if (!options?.skipHistory) {
          // Mesma coalesceKey dentro da janela = mesmo gesto: o snapshot
          // pré-gesto já está na pilha, não empilhar de novo
          const now = Date.now()
          const sameGesture = mesmaEntradaDeDesfazer(lastCoalesceRef.current, options, now)

          if (!sameGesture) {
            const snapshot = cloneDesign(prev)
            historyRef.current.past = [...historyRef.current.past.slice(-49), snapshot]
          }
          lastCoalesceRef.current = { key: options?.coalesceKey ?? null, time: now }
          historyRef.current.future = []
        }
        updateHistoryMeta()
        return next
      })
    },
    [updateHistoryMeta],
  )

  const selectLayer = React.useCallback((id: string | null, options?: { additive?: boolean; toggle?: boolean }) => {
    if (!id) {
      setSelectedLayerIds([])
      return
    }
    setSelectedLayerIds((prev) => {
      if (options?.additive) {
        const exists = prev.includes(id)
        if (exists) {
          if (options?.toggle) {
            return prev.filter((layerId) => layerId !== id)
          }
          return prev
        }
        return [...prev, id]
      }
      return [id]
    })
  }, [])

  const selectLayers = React.useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean))) as string[]
    setSelectedLayerIds(unique)
  }, [])

  const toggleLayerSelection = React.useCallback((id: string) => {
    setSelectedLayerIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }, [])

  const clearLayerSelection = React.useCallback(() => {
    setSelectedLayerIds([])
  }, [])

  // Grupo estilo Canva é só metadado nas layers da página (`metadata.groupId`),
  // o mesmo vínculo que as combinações de fontes já usam — persiste pelo
  // autosave sem mudança de schema, e o comportamento (1º clique seleciona o
  // grupo, 2º entra no elemento, arraste em conjunto) vive no stage. Agrupar
  // uma seleção que já contém membros de outro grupo ABSORVE esses membros:
  // não há grupo aninhado, e o que ficou de fora mantém o vínculo antigo.
  const groupSelectedLayers = React.useCallback(() => {
    const ids = selectedLayerIdsRef.current
    if (ids.length < 2) return
    // G4.3: célula de grade não entra em grupo (o groupId dela é o da grade; trocá-lo quebraria a grade)
    if (agruparTocaGrade(designAtualRef.current.layers, ids)) {
      toast({ description: MENSAGEM_AGRUPAR_GRADE })
      return
    }
    const groupId = `grupo-${createId()}`
    applyDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        ids.includes(layer.id) ? { ...layer, metadata: { ...(layer.metadata ?? {}), groupId } } : layer,
      ),
    }))
  }, [applyDesign])

  const ungroupLayers = React.useCallback((ids: string[] = selectedLayerIdsRef.current) => {
    if (ids.length === 0) return
    // G4.3: o grupo comum perde o groupId como sempre; o que é uma GRADE é desvinculado em todos os membros (sai
    // `grade` e `groupId` juntos — tirar só o groupId deixava a grade incoerente), no mesmo desfazer
    applyDesign((prev) => {
      const layers = desagruparNoDesign(prev, ids)
      return layers ? { ...prev, layers } : prev
    })
  }, [applyDesign])

  const updateLayer = React.useCallback(
    (id: string, updater: (layer: Layer) => Layer, options?: { coalesceKey?: string; gesto?: boolean }) => {
      // G4.3: a edição genérica de UMA camada (propriedades, painéis, gerador de criativo, arraste antigo) não quebra
      // a grade — ver `edicaoDaCamada`. O aviso é decidido aqui, sobre o estado mais novo; o updater (que o React
      // pode repetir) só confere de novo e devolve a camada como estava.
      const atual = designAtualRef.current.layers.find((layer) => layer.id === id)
      if (atual && (vinculadaAGrade(atual) || atual.metadata?.groupId)) {
        const e = edicaoDaCamada(atual, updater(atual), designAtualRef.current.layers)
        if (!e.ok) {
          toast({ description: e.motivo })
          return
        }
      }
      applyDesign(
        (prev) => {
          let changed = false
          const nextLayers = prev.layers.map((layer) => {
            if (layer.id !== id) return layer
            const proposta = updater(layer)
            if (proposta === layer) return layer
            const e = edicaoDaCamada(layer, proposta, prev.layers)
            if (!e.ok) return layer
            changed = true
            return e.camada
          })
          if (!changed) return prev
          return { ...prev, layers: normalizeLayerOrder(nextLayers) }
        },
        // Edições contínuas na mesma camada (digitação, slider) coalescem num
        // undo só; quem precisa agrupar VÁRIAS camadas num gesto (drag em
        // grupo, alinhamento) passa a própria chave
        { coalesceKey: options?.coalesceKey ?? `layer:${id}`, gesto: options?.gesto },
      )
    },
    [applyDesign],
  )

  const updateLayerPartial = React.useCallback(
    (id: string, partial: Partial<Layer>) => {
      updateLayer(id, (layer) => ({ ...layer, ...partial }))
    },
    [updateLayer],
  )

  const updateLayerStyle = React.useCallback(
    (id: string, style: Layer['style']) => {
      updateLayer(id, (layer) => {
        const nextStyle = { ...layer.style, ...style }
        return {
          ...layer,
          style: layer.type === 'shape'
            ? canonicalizeShapeStyleForPersistence(nextStyle)
            : nextStyle,
        }
      })
    },
    [updateLayer],
  )

  const moveLayer = React.useCallback(
    (id: string, deltaX: number, deltaY: number) => {
      updateLayer(id, (layer) => ({
        ...layer,
        position: {
          x: Math.round((layer.position?.x ?? 0) + deltaX),
          y: Math.round((layer.position?.y ?? 0) + deltaY),
        },
      }))
    },
    [updateLayer],
  )

  const addLayer = React.useCallback(
    (layer: Layer) => {
      // O "+" da linha do tempo armou a aba: a foto/vídeo entra como clipe
      const comoClipe = consumirInsercaoDeClipe() && (layer.type === 'image' || layer.type === 'video')
      if ((comoClipe || ehClipe(layer)) && !reservaDeClipesRef.current.reservar(designAtualRef.current.layers)) {
        toast({ variant: 'destructive', description: MENSAGEM_TETO_DE_CLIPES })
        return
      }
      applyDesign((prev) => {
        const nextLayers = comoClipe
          ? inserirClipe(prev.layers, layer, prev.canvas)
          : normalizeLayerOrder([...prev.layers, layer])
        return { ...prev, layers: nextLayers }
      })
      setSelectedLayerIds([layer.id])
    },
    [applyDesign],
  )

  const inserirGrade = React.useCallback<TemplateEditorContextValue['inserirGrade']>(
    async (layout, { medirFoto }) => {
      // Nada de `consumirInsercaoDeClipe`: a grade nunca vira clipe e o "+" armado segue armado
      const n = layoutDoCatalogo(layout, VERSAO_DO_CATALOGO)?.celulas.length ?? 0
      const pedido = { layout, idDaGrade: `grade-${createId()}`, idsDasCelulas: Array.from({ length: n }, () => createId()) }
      const alvo = { pagina: paginaAtualRef.current, documento: documentoAtualRef.current, geracao: geracaoRef.current!.valor() }
      const fundo = fundoParaMedir(designAtualRef.current)
      let medida: MedidaDoFundo | null = null
      if (fundo) {
        const foto = await Promise.resolve()
          .then(() => medirFoto(fundo.fileUrl))
          .catch(() => undefined)
        const base = typeof window === 'undefined' ? undefined : window.location.href
        medida = { camadaId: fundo.camadaId, impressao: fundo.impressao, natural: dimensoesDaFotoCarregada(foto, fundo.fileUrl, base) }
      }
      return new Promise<DesfechoDaInsercao>((resolve) => {
        applyDesign((prev) => {
          const outroAlvo =
            paginaAtualRef.current !== alvo.pagina || documentoAtualRef.current !== alvo.documento || geracaoRef.current!.valor() !== alvo.geracao
          const r: DesfechoDaInsercao = outroAlvo ? { ok: false, codigo: 'ALVO_MUDOU', mensagem: MENSAGEM_ALVO_MUDOU } : inserirGradeNoDesign(prev, pedido, medida)
          resolve(r)
          if (!r.ok) return prev
          setSelectedLayerIds(r.celulas)
          return { ...prev, layers: normalizeLayerOrder(r.layers) }
        })
      })
    },
    [applyDesign],
  )

  const planejarPreenchimento = React.useCallback<TemplateEditorContextValue['planejarPreenchimento']>((quantas) => {
    const plano = planoDePreenchimento(designAtualRef.current, selectedLayerIdsRef.current, quantas)
    if (plano.tipo !== 'grade') return plano
    const chave = { pagina: paginaAtualRef.current, documento: documentoAtualRef.current, geracao: geracaoRef.current!.valor() }
    return { ...plano, alvo: { ...plano.alvo, chave } }
  }, [])

  const preencherGrade = React.useCallback<TemplateEditorContextValue['preencherGrade']>(
    (alvo, fotos, falhas = [], cancelado) =>
      new Promise<DesfechoDoPreenchimento>((resolve) => {
        // Nada de `addLayer` nem `consumirInsercaoDeClipe`: a foto entra na célula e o "+" armado segue armado
        applyDesign((prev) => {
          const c = alvo.chave
          const outroAlvo =
            !c || paginaAtualRef.current !== c.pagina || documentoAtualRef.current !== c.documento || geracaoRef.current!.valor() !== c.geracao
          const r = cancelado?.aborted
            ? recusaDoPreenchimento('CANCELADO', 'Preenchimento cancelado: nada foi aplicado.', falhas)
            : outroAlvo
              ? recusaDoPreenchimento('ALVO_MUDOU', MENSAGEM_LOTE_FORA_DO_ALVO, falhas)
              : preencherNoDesign(prev, alvo, fotos, falhas)
          resolve(r)
          return r.ok ? { ...prev, layers: normalizeLayerOrder(r.layers) } : prev
        })
      }),
    [applyDesign],
  )

  const adicionarFotoAvulsa = React.useCallback(
    (camada: Layer) => {
      const limpa = fotoAvulsaLimpa(camada)
      applyDesign((prev) => ({ ...prev, layers: normalizeLayerOrder([...prev.layers, limpa]) }))
      setSelectedLayerIds([limpa.id])
    },
    [applyDesign],
  )

  const planejarAjusteDaGrade = React.useCallback<TemplateEditorContextValue['planejarAjusteDaGrade']>((gradeId) => {
    const plano = planoDoAjuste(designAtualRef.current, gradeId)
    if (plano.tipo !== 'grade') return plano
    const chave = { pagina: paginaAtualRef.current, documento: documentoAtualRef.current, geracao: geracaoRef.current!.valor() }
    return { ...plano, alvo: { ...plano.alvo, chave } }
  }, [])

  const aplicarAjusteDaGrade = React.useCallback<TemplateEditorContextValue['aplicarAjusteDaGrade']>(
    (alvo, mudanca, dimensoes, cancelado) =>
      new Promise<DesfechoDoAjuste>((resolve) => {
        // Ids das células que um layout maior criar: gerados fora do updater (o React pode rodá-lo duas vezes)
        const n = mudanca.layout ? (layoutDoCatalogo(mudanca.layout, VERSAO_DO_CATALOGO)?.celulas.length ?? 0) : 0
        const idsNovos = Array.from({ length: n }, () => createId())
        applyDesign((prev) => {
          const c = alvo.chave
          const outroAlvo =
            !c || paginaAtualRef.current !== c.pagina || documentoAtualRef.current !== c.documento || geracaoRef.current!.valor() !== c.geracao
          const r: DesfechoDoAjuste = cancelado?.aborted
            ? { ok: false, codigo: 'CANCELADO', mensagem: 'Ajuste cancelado: nada foi aplicado.' }
            : outroAlvo
              ? { ok: false, codigo: 'ALVO_MUDOU', mensagem: MENSAGEM_AJUSTE_FORA_DO_ALVO }
              : ajustarGradeNoDesign(prev, alvo, mudanca, dimensoes, idsNovos)
          resolve(r)
          if (!r.ok) return prev
          setSelectedLayerIds(r.selecionar)
          return { ...prev, layers: normalizeLayerOrder(r.layers) }
        })
      }),
    [applyDesign],
  )

  const moverSelecao = React.useCallback<TemplateEditorContextValue['moverSelecao']>(
    (ids, dx, dy, opcoes) =>
      new Promise<DesfechoDoAjuste>((resolve) => {
        applyDesign(
          (prev) => {
            const r = moverNoDesign(prev, ids, dx, dy)
            resolve(r)
            return r.ok ? { ...prev, layers: normalizeLayerOrder(r.layers) } : prev
          },
          { coalesceKey: opcoes?.coalesceKey },
        )
      }),
    [applyDesign],
  )

  const desvincularGrade = React.useCallback<TemplateEditorContextValue['desvincularGrade']>(
    (gradeId) =>
      new Promise<DesfechoDoAjuste>((resolve) => {
        applyDesign((prev) => {
          const r = desvincularNoDesign(prev, gradeId)
          resolve(r)
          return r.ok ? { ...prev, layers: normalizeLayerOrder(r.layers) } : prev
        })
      }),
    [applyDesign],
  )

  const applySoftTopGradient = React.useCallback(() => {
    applyDesign((prev) => {
      const layers = aplicarGradienteSuave(prev.layers, prev.canvas)
      return layers === prev.layers ? prev : { ...prev, layers }
    })
    setSelectedLayerIds([ID_GRADIENTE_SUAVE])
  }, [applyDesign])

  const duplicateLayer = React.useCallback(
    (id: string) => {
      const source = design.layers.find((layer) => layer.id === id)
      if (!source) return
      // G4.3: com a grade INTEIRA selecionada, duplicar é duplicar a grade (ids novos, um deslocamento, um desfazer); a
      // célula sozinha sai foto avulsa. "Duplicar seleção" chama uma vez por membro: só a 1ª chamada desta seleção conta.
      const gradeId = metadadoDeGrade(source)?.id
      const selecao = selectedLayerIdsRef.current
      if (typeof gradeId === 'string' && gradeId && membrosDaGrade(designAtualRef.current.layers, gradeId).every((c) => selecao.includes(c.id))) {
        const ultima = ultimaGradeDuplicadaRef.current
        if (ultima.selecao === selecao && ultima.gradeId === gradeId) return
        const novos = { idDaGrade: `grade-${createId()}`, ids: membrosDaGrade(designAtualRef.current.layers, gradeId).map(() => createId()) }
        const proximo = () => {
          const fila = [...novos.ids]
          return { idDaGrade: novos.idDaGrade, idDaCelula: () => fila.shift()! }
        }
        if (!duplicarGradeNoDesign(designAtualRef.current, gradeId, proximo())) {
          toast({ description: 'A grade está quebrada e não foi duplicada: desvincule da grade para copiar as fotos soltas.' })
          return
        }
        ultimaGradeDuplicadaRef.current = { selecao, gradeId }
        applyDesign((prev) => {
          const r = duplicarGradeNoDesign(prev, gradeId, proximo())
          return r ? { ...prev, layers: normalizeLayerOrder(r.layers) } : prev
        })
        setSelectedLayerIds(novos.ids)
        return
      }
      // C9-02/C9-11: a cópia é texto NOVO — sem a identidade autoral da original (e sem o papel, se a página tem
      // contrato). A transformação é pura e testada em `camada-copiada.ts`. G4.3: célula copiada sozinha sai avulsa.
      const copia = semVinculoDeGrade(camadaDuplicadaNoEditor(source, { novoId: createId(), paginaTemContrato: temCopyAutoral }))
      if (ehClipe(source)) {
        if (!reservaDeClipesRef.current.reservar(designAtualRef.current.layers)) {
          toast({ variant: 'destructive', description: MENSAGEM_TETO_DE_CLIPES })
          return
        }
        // Clipe duplicado fica no MESMO lugar (tela cheia) e entra logo depois do original na sequência
        applyDesign((prev) => {
          const ids = normalizarClipes(prev.layers).filter((l) => ehClipe(l)).map((l) => l.id)
          ids.splice(ids.indexOf(source.id) + 1, 0, copia.id)
          return { ...prev, layers: normalizarClipes([...prev.layers, { ...copia, position: source.position }], ids) }
        })
        setSelectedLayerIds([copia.id])
        return
      }
      addLayer(copia)
    },
    [addLayer, applyDesign, design.layers, temCopyAutoral],
  )

  const excluir = React.useCallback(
    (ids: string[], opcoes: { celulaSoEsvazia?: boolean } = {}) => {
      if (ids.length === 0) return
      // G4.3 (rodada 1): a exclusão em lote é UMA operação, um desfazer — grade INTEIRA entre os ids sai inteira,
      // célula sem as irmãs é ESVAZIADA (continua selecionada; a geometria não fura), o resto sai como sempre
      const previsto = removerNoDesign(designAtualRef.current, ids, opcoes)
      applyDesign((prev) => {
        const r = removerNoDesign(prev, ids, opcoes)
        return r ? { ...prev, layers: normalizeLayerOrder(r.layers) } : prev
      })
      const saem = new Set(previsto?.removidas ?? [])
      if (saem.size > 0) setSelectedLayerIds((prev) => prev.filter((layerId) => !saem.has(layerId)))
    },
    [applyDesign],
  )
  const removeLayers = React.useCallback((ids: string[]) => excluir(ids), [excluir])

  // A lixeira de UMA camada (linha do painel): só ela — célula de grade é ESVAZIADA (vazia: nada muda), nunca apagada,
  // nem a única de uma grade de uma célula
  const removeLayer = React.useCallback((id: string) => excluir([id], { celulaSoEsvazia: true }), [excluir])

  const toggleLayerVisibility = React.useCallback(
    (id: string) => {
      updateLayer(id, (layer) => ({ ...layer, visible: layer.visible === false ? true : !layer.visible }))
    },
    [updateLayer],
  )

  const toggleLayerLock = React.useCallback(
    (id: string) => {
      updateLayer(id, (layer) => ({ ...layer, locked: !layer.locked }))
    },
    [updateLayer],
  )

  const reorderLayers = React.useCallback(
    (idsInOrder: string[]) => {
      applyDesign((prev) => {
        const idToLayer = new Map(prev.layers.map((layer) => [layer.id, layer]))
        const nextLayers: Layer[] = []
        idsInOrder.forEach((layerId) => {
          const layer = idToLayer.get(layerId)
          if (layer) nextLayers.push(layer)
        })
        // add any missing layers at the end
        prev.layers.forEach((layer) => {
          if (!idsInOrder.includes(layer.id)) {
            nextLayers.push(layer)
          }
        })
        const normalized = normalizeLayerOrder(nextLayers)
        return { ...prev, layers: normalized }
      })
    },
    [applyDesign],
  )

  const updateCanvas = React.useCallback((canvas: Partial<DesignData['canvas']>) => {
    applyDesign((prev) => ({ ...prev, canvas: { ...prev.canvas, ...canvas } }))
  }, [applyDesign])

  // Trilha da página. Sliders (volume/trim) coalescem num undo só por gesto.
  const setPageAudio = React.useCallback((audio: DesignData['audio']) => {
    applyDesign((prev) => ({ ...prev, audio: audio ?? null }), { coalesceKey: 'page-audio' })
  }, [applyDesign])

  const copySelectedLayers = React.useCallback(() => {
    if (selectedLayerIds.length === 0) return
    const selection = design.layers.filter((layer) => selectedLayerIds.includes(layer.id))
    if (selection.length === 0) return
    clipboardRef.current = selection.map((layer) => {
      try {
        return structuredClone(layer)
      } catch {
        return JSON.parse(JSON.stringify(layer)) as Layer
      }
    })
  }, [design.layers, selectedLayerIds])

  const pasteLayers = React.useCallback(() => {
    const clipboard = clipboardRef.current
    if (!clipboard || clipboard.length === 0) return

    // C9-02/C9-11: colar é duplicar — a transformação é a mesma, pura e testada em `camada-copiada.ts`.
    const clones = camadasColadasNoEditor(clipboard, { novoId: createId, paginaTemContrato: temCopyAutoral })
    if (!reservaDeClipesRef.current.reservar(designAtualRef.current.layers, clones.filter((l) => ehClipe(l)).length)) {
      toast({ variant: 'destructive', description: MENSAGEM_TETO_DE_CLIPES })
      return
    }

    applyDesign((prev) => {
      const nextLayers = normalizeLayerOrder([...prev.layers, ...clones])
      return { ...prev, layers: nextLayers }
    })
    setSelectedLayerIds(clones.map((layer) => layer.id))
  }, [applyDesign, temCopyAutoral])

  const undo = React.useCallback(() => {
    lastCoalesceRef.current = { key: null, time: 0 }
    setDesign((prev) => {
      const past = historyRef.current.past
      if (!past.length) return prev
      const previous = past[past.length - 1]
      historyRef.current.past = past.slice(0, -1)
      historyRef.current.future = [cloneDesign(prev), ...historyRef.current.future].slice(0, 50)
      setDirty(true)
      updateHistoryMeta()
      const nextDesign = cloneDesign(previous)
      const existingIds = new Set(nextDesign.layers.map((layer) => layer.id))
      setSelectedLayerIds((current) => current.filter((id) => existingIds.has(id)))
      return nextDesign
    })
  }, [updateHistoryMeta])

  const redo = React.useCallback(() => {
    lastCoalesceRef.current = { key: null, time: 0 }
    setDesign((prev) => {
      const future = historyRef.current.future
      if (!future.length) return prev
      const nextState = future[0]
      historyRef.current.future = future.slice(1)
      historyRef.current.past = [...historyRef.current.past.slice(-49), cloneDesign(prev)]
      setDirty(true)
      updateHistoryMeta()
      const nextDesign = cloneDesign(nextState)
      const existingIds = new Set(nextDesign.layers.map((layer) => layer.id))
      setSelectedLayerIds((current) => current.filter((id) => existingIds.has(id)))
      return nextDesign
    })
  }, [updateHistoryMeta])

  const generateThumbnail = React.useCallback(
    async (maxWidth = 300): Promise<string | null> => {
      const stage = stageInstanceRef.current
      if (!stage) {
        console.warn('[generateThumbnail] Stage não disponível')
        return null
      }

      if (typeof document === 'undefined') {
        return null
      }

      // A miniatura é o quadro de 0 da página: com vídeo tocando, fora do 0 ou
      // ainda sem o quadro decodificado, a captura sairia de um instante
      // qualquer — quem chama já trata `null` (mantém a anterior ou cai no
      // PagePreviewStage).
      const relogio = relogioDaPagina(multiPage?.currentPageId).estado()
      if (relogio.tocando || relogio.t !== 0 || relogio.modo === 'gravacao') return null
      if (!videosProntosEmZero(design.layers)) return null

      const canvasWidth = design.canvas.width
      const canvasHeight = design.canvas.height
      const aspectRatio = canvasWidth / canvasHeight

      let thumbWidth = maxWidth
      let thumbHeight = Math.round(maxWidth / aspectRatio)

      if (thumbHeight > maxWidth * 2) {
        thumbHeight = maxWidth * 2
        thumbWidth = Math.round(thumbHeight * aspectRatio)
      }

      let cloneStage: Konva.Stage | null = null
      let cloneContainer: HTMLDivElement | null = null

      try {
        // Garantir que o stage atual esteja desenhado antes de clonar
        stage.batchDraw()

        cloneContainer = document.createElement('div')
        cloneContainer.style.position = 'absolute'
        cloneContainer.style.pointerEvents = 'none'
        cloneContainer.style.opacity = '0'
        cloneContainer.style.left = '-10000px'
        cloneContainer.style.top = '-10000px'
        cloneContainer.style.width = `${canvasWidth}px`
        cloneContainer.style.height = `${canvasHeight}px`
        document.body.appendChild(cloneContainer)

        cloneStage = stage.clone({
          container: cloneContainer,
          listening: false,
        })

        // Normalizar transformação apenas no clone
        cloneStage.scale({ x: 1, y: 1 })
        cloneStage.position({ x: 0, y: 0 })
        cloneStage.size({ width: canvasWidth, height: canvasHeight })
        cloneStage.batchDraw()

        // Ocultar elementos de UI no clone
        const guidesLayer = cloneStage.findOne('.guides-layer')
        guidesLayer?.visible(false)

        const gridLayer = cloneStage.findOne('.grid-layer')
        gridLayer?.visible(false)

        cloneStage.find('Transformer').forEach((node) => {
          if (node.getClassName() === 'Transformer') {
            node.destroy()
          }
        })

        // O quadro de 0 como o export e o render de servidor o desenham: o
        // clone herda o que a prévia escreveu nos grupos de efeito (um gesto
        // suspenso, o instante em que a página parou), não o quadro de 0
        aplicarQuadro(
          cloneStage,
          { layers: design.layers, audio: design.audio ?? null, canvas: { width: canvasWidth } },
          0,
          { gravando: true, duracoes: duracoesDosVideosMontados() },
        )

        // Respeitar camadas invisíveis
        const contentLayer = cloneStage.findOne('.content-layer') as Konva.Layer | undefined
        if (contentLayer) {
          contentLayer.getChildren().forEach((node: Konva.Node) => {
            const layerId = node.id() || node.getAttr('camadaId')
            const layer = design.layers.find((l) => l.id === layerId)
            if (layer && layer.visible === false) {
              node.visible(false)
            }
          })
        }

        cloneStage.batchDraw()

        return cloneStage.toDataURL({
          pixelRatio: thumbWidth / canvasWidth,
          mimeType: 'image/jpeg',
          quality: 0.85,
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        })
      } catch (error) {
        console.error('[generateThumbnail] Erro ao gerar thumbnail:', error)
        return null
      } finally {
        cloneStage?.destroy()
        if (cloneContainer?.parentNode) {
          cloneContainer.parentNode.removeChild(cloneContainer)
        }
      }
    },
    [design.canvas.width, design.canvas.height, design.layers, design.audio, multiPage?.currentPageId],
  )

  /**
   * Export stage as data URL — same rendering as exportDesign but without upload/save.
   * Uses the original stage (not a clone) for pixel-perfect output.
   */
  const exportStageDataUrl = React.useCallback(
    async (format: 'png' | 'jpeg' = 'jpeg'): Promise<string> => {
      const stage = stageInstanceRef.current
      if (!stage) throw new Error('Canvas não está pronto')

      // Save current state
      const prevSelection = [...selectedLayerIdsRef.current]
      const prevZoom = zoom
      const prevPosition = { x: stage.x(), y: stage.y() }
      const invisibleNodes: Array<{ node: Konva.Node; wasVisible: boolean }> = []

      try {
        // Clear selection
        setSelectedLayerIds([])
        await new Promise((r) => requestAnimationFrame(r))

        // Normalize zoom
        setZoomState(1)
        stage.scale({ x: 1, y: 1 })
        stage.position({ x: 0, y: 0 })
        await new Promise((r) => requestAnimationFrame(r))

        // Hide guides
        const guidesLayer = stage.findOne('.guides-layer')
        const guidesWas = guidesLayer?.visible() ?? false
        guidesLayer?.visible(false)

        // Hide invisible layers
        const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined
        contentLayer?.getChildren().forEach((node: Konva.Node) => {
          const layerId = node.id() || node.getAttr('camadaId')
          const layer = design.layers.find((l) => l.id === layerId)
          if (layer && layer.visible === false) {
            invisibleNodes.push({ node, wasVisible: node.visible() })
            node.visible(false)
          }
        })

        stage.batchDraw()
        await new Promise((r) => requestAnimationFrame(r))

        const w = design.canvas.width
        const h = design.canvas.height
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'

        const dataUrl = stage.toDataURL({
          pixelRatio: 1,
          mimeType,
          quality: format === 'jpeg' ? 0.92 : undefined,
          x: 0, y: 0, width: w, height: h,
        })

        return dataUrl
      } finally {
        // Restore everything
        invisibleNodes.forEach(({ node, wasVisible }) => node.visible(wasVisible))
        const guidesLayer2 = stage.findOne('.guides-layer')
        guidesLayer2?.visible(true)
        setZoomState(prevZoom)
        stage.scale({ x: prevZoom, y: prevZoom })
        stage.position(prevPosition)
        setSelectedLayerIds(prevSelection)
        stage.batchDraw()
      }
    },
    [design.canvas.width, design.canvas.height, design.layers, zoom],
  )

  const exportDesign = React.useCallback(
    async (format: 'png' | 'jpeg', pageName?: string) => {
      const stage = stageInstanceRef.current
      if (!stage) {
        throw new Error('Canvas não está pronto para exportação.')
      }
      setIsExporting(true)

      // Placeholder - validação será feita após o export
      let exportDataUrl = ''
      let exportFileName = ''

      // Salvar estado atual
      const previousSelection = [...selectedLayerIdsRef.current]
      const previousZoom = zoom
      const previousPosition = { x: stage.x(), y: stage.y() }

      // Estado das camadas invisíveis (precisa ser definido aqui para estar disponível no finally)
      const invisibleLayersState: Array<{ node: Konva.Node; originalOpacity: number; originalVisible: boolean }> = []

      try {
        // 1. Limpar seleção para ocultar transformers
        setSelectedLayerIds([])

        // 2. Aguardar próximo frame para React atualizar
        await new Promise((resolve) => requestAnimationFrame(resolve))

        // 3. Normalizar zoom para 100% (escala 1:1)
        setZoomState(1)
        stage.scale({ x: 1, y: 1 })
        stage.position({ x: 0, y: 0 })

        // 4. Aguardar frame para zoom ser aplicado
        await new Promise((resolve) => requestAnimationFrame(resolve))

        // 5. Ocultar camada de guides temporariamente
        const guidesLayer = stage.findOne('.guides-layer')
        const guidesWasVisible = guidesLayer?.visible() ?? false
        if (guidesLayer) {
          guidesLayer.visible(false)
        }

        // O design de AGORA, não o do render em que esta função nasceu: o lote de criativos troca de página e chama a
        // mesma `exportDesign` capturada no início, e com o `design` do fechamento a Story saía na altura da Feed.
        const atual = designAtualRef.current

        // 6. Ocultar completamente camadas invisíveis (visible: false)
        const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined

        if (contentLayer) {
          const children = (contentLayer as Konva.Layer).getChildren()

          children.forEach((node: Konva.Node) => {
            const layerId = node.id() || node.getAttr('camadaId')
            const layer = atual.layers.find((l) => l.id === layerId)

            // Se a camada está marcada como invisível, ocultar completamente para exportação
            if (layer && layer.visible === false) {
              // Salvar estado original
              invisibleLayersState.push({
                node,
                originalOpacity: node.opacity(),
                originalVisible: node.visible(),
              })

              // Ocultar node do Konva
              node.visible(false)
            }
          })
        }

        // 7. Forçar redraw para aplicar mudanças
        stage.batchDraw()

        // 8. Aguardar frame para garantir que mudanças foram aplicadas
        await new Promise((resolve) => requestAnimationFrame(resolve))

        // 8. Exportar com dimensões exatas do canvas em resolução nativa
        const canvasWidth = atual.canvas.width
        const canvasHeight = atual.canvas.height

        // Para JPEG, tentar diferentes qualidades até atingir tamanho aceitável (8MB max)
        const MAX_SIZE_MB = 8
        const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
        let quality = 0.9 // Qualidade inicial 90%
        let dataUrl = ''
        let sizeBytes = 0

        if (format === 'jpeg') {
          // Tentar exportar com qualidade 90%
          dataUrl = stage.toDataURL({
            pixelRatio: 2,
            mimeType: 'image/jpeg',
            quality: quality,
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
          })

          const base64 = dataUrl.split(',')[1] ?? ''
          sizeBytes = Math.round((base64.length * 3) / 4)

          // Se arquivo for maior que 8MB, reduzir qualidade iterativamente
          while (sizeBytes > MAX_SIZE_BYTES && quality > 0.5) {
            quality -= 0.05
            dataUrl = stage.toDataURL({
              pixelRatio: 2,
              mimeType: 'image/jpeg',
              quality: quality,
              x: 0,
              y: 0,
              width: canvasWidth,
              height: canvasHeight,
            })
            const newBase64 = dataUrl.split(',')[1] ?? ''
            sizeBytes = Math.round((newBase64.length * 3) / 4)
          }
        } else {
          // PNG sem compressão
          dataUrl = stage.toDataURL({
            pixelRatio: 2,
            mimeType: 'image/png',
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
          })
          const base64 = dataUrl.split(',')[1] ?? ''
          sizeBytes = Math.round((base64.length * 3) / 4)
        }

        // Gerar nome do arquivo com data e nome da página
        const today = new Date()
        const dateStr = today.toISOString().split('T')[0] // YYYY-MM-DD

        // Se pageName foi fornecido, usar formato: 2025-12-12_Pag.01.png
        // Se não, usar formato legado: template-{id}-{timestamp}.png
        let fileName: string
        if (pageName) {
          const extension = format === 'jpeg' ? 'jpg' : 'png'
          // Sanitizar: remover espaços, acentos e caracteres especiais
          const sanitizedPageName = pageName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/\s+/g, '') // Remove espaços
            .replace(/[^\w.-]/g, '') // Remove caracteres especiais exceto . e -
            .trim()
          fileName = `${dateStr}_${sanitizedPageName}.${extension}`
        } else {
          const timestamp = Date.now()
          fileName = format === 'jpeg'
            ? `template-instagram-${timestamp}.jpg`
            : `template-${template.id}-${timestamp}.png`
        }

        // Salvar dataURL e fileName para enviar à API
        exportDataUrl = dataUrl
        exportFileName = fileName

        const record: ExportRecord = {
          id: createId(),
          format,
          dataUrl,
          width: canvasWidth,
          height: canvasHeight,
          fileName,
          sizeBytes,
          createdAt: Date.now(),
        }
        setExportHistory((prev) => [record, ...prev].slice(0, 20))

        // 9. Restaurar visibilidade dos guides
        if (guidesLayer) {
          guidesLayer.visible(guidesWasVisible)
        }

        // 10. Enviar para API para salvar no banco e deduzir créditos
        console.log('[EXPORT] Sending to API for saving...')
        try {
          const response = await fetch(`/api/templates/${template.id}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              format,
              dataUrl: exportDataUrl,
              fileName: exportFileName
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            if (response.status === 402) {
              throw new Error(`Créditos insuficientes para exportar. Necessário: ${errorData.required}, Disponível: ${errorData.available}`)
            }
            throw new Error(errorData.error || 'Erro ao salvar exportação')
          }

          const data = await response.json()
          console.log('[EXPORT] Saved successfully. Remaining credits:', data.creditsRemaining)

          // Sem isso não dá para melhorar a arte recém-gerada: a fila de
          // melhoria precisa do id da Generation que o servidor acabou de criar.
          record.generationId = data?.generation?.id
          record.resultUrl = data?.generation?.resultUrl

          // Invalidar cache dos criativos para atualizar a lista automaticamente
          queryClient.invalidateQueries({ queryKey: ['template-creatives', template.id] })
        } catch (error) {
          console.error('[EXPORT] Failed to save:', error)
          throw error // Re-lançar o erro para ser capturado pelo caller
        }

        return record
      } finally {
        // 11. Restaurar estado das camadas invisíveis PRIMEIRO
        invisibleLayersState.forEach(({ node, originalOpacity, originalVisible }) => {
          node.opacity(originalOpacity)
          node.visible(originalVisible)
        })

        // 12. Restaurar zoom, posição e seleção original
        setZoomState(previousZoom)
        stage.scale({ x: previousZoom, y: previousZoom })
        stage.position(previousPosition)
        stage.batchDraw()
        setSelectedLayerIds(previousSelection)
        setIsExporting(false)
      }
    },
    [template.id, zoom, queryClient],
  )

  const removeExport = React.useCallback((id: string) => {
    setExportHistory((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearExports = React.useCallback(() => {
    setExportHistory([])
  }, [])

  const loadTemplate = React.useCallback(
    ({ designData, dynamicFields: nextDynamicFields, name: nextName, markDirty = true, historyKey }: {
      designData: DesignData
      dynamicFields?: DynamicField[] | null
      name?: string
      /** false = carga de navegação (troca de página), não conta como edição */
      markDirty?: boolean
      /**
       * Identidade do histórico (pageId no editor multi-página). Com a chave,
       * trocar de página TROCA a pilha de undo em vez de descartá-la — voltar
       * para a página recupera o histórico dela. Sem chave, comportamento
       * antigo (zera).
       */
      historyKey?: string
    }) => {
      geracaoRef.current!.carregou()
      const clonedDesign: DesignData = cloneDesign(designData)
      clonedDesign.layers = normalizeLayerOrder(clonedDesign.layers ?? [])

      applyDesign(() => clonedDesign, { skipHistory: true, markDirty: false })
      if (historyKey) {
        const histories = historiesRef.current
        let entry = histories.get(historyKey)
        if (entry) {
          // Reinsere para virar a entrada mais recente do LRU
          histories.delete(historyKey)
        } else {
          entry = { past: [], future: [] }
        }
        histories.set(historyKey, entry)
        // LRU: 50 snapshots × N páginas pesam — manter só as 5 mais recentes
        while (histories.size > 5) {
          const oldest = histories.keys().next().value
          if (oldest === undefined) break
          histories.delete(oldest)
        }
        historyRef.current = entry
      } else {
        historyRef.current = { past: [], future: [] }
      }
      lastCoalesceRef.current = { key: null, time: 0 }
      updateHistoryMeta()
      if (Array.isArray(nextDynamicFields)) {
        setDynamicFieldsState([...nextDynamicFields])
      } else {
        setDynamicFieldsState([])
      }
      // Não auto-selecionar camada ao carregar página — evita toolbar/lixeira armadas sem ação do usuário
      setSelectedLayerIds([])
      if (nextName) {
        setName(nextName)
      }
      if (markDirty) {
        setDirty(true)
      }
    },
    [applyDesign, updateHistoryMeta],
  )

  const markSaved = React.useCallback((nextTemplate?: Partial<TemplateResource>) => {
    // Não repor nextTemplate.designData no design: é o snapshot enviado no clique de salvar.
    // Se o usuário trocou de página (ou continuou editando) durante o round-trip, repor aqui
    // colocaria layers de outra página no design — e o autosave gravaria na página errada.
    if (nextTemplate?.name) {
      setName(nextTemplate.name)
    }
    if (nextTemplate?.dynamicFields) {
      setDynamicFieldsState(Array.isArray(nextTemplate.dynamicFields) ? [...nextTemplate.dynamicFields] : [])
    }
    setDirty(false)
  }, [])

  const forceUpdate = React.useCallback(() => {
    setUpdateCounter((prev) => prev + 1)
  }, [])

  // Alignment & Organization Methods

  /**
   * Coleta os nodes do stage correspondentes à seleção, junto das layers.
   * Devolve null quando o stage ainda não montou.
   */
  const colherNodesSelecionados = React.useCallback(() => {
    const stage = stageInstanceRef.current
    if (!stage) return null

    const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined
    if (!contentLayer) return null

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    return nodes.length > 0 ? { contentLayer, nodes } : null
  }, [selectedLayerIds, design.layers])

  /** Grava no estado a posição que o Konva acabou de calcular */
  const persistirPosicoes = React.useCallback(
    (nodes: Array<{ node: Konva.Node; layer: Layer }>) => {
      // Uma chave por gesto: alinhar 5 camadas vira UM passo de undo, não 5
      const coalesceKey = `align:${Date.now()}`
      nodes.forEach(({ node, layer }) => {
        updateLayer(
          layer.id,
          (l) => ({
            ...l,
            position: { x: Math.round(node.x()), y: Math.round(node.y()) },
          }),
          { coalesceKey },
        )
      })
    },
    [updateLayer],
  )

  /**
   * Alinha a seleção num eixo.
   *
   * Com dois ou mais elementos, alinha uns aos outros (a borda de referência é
   * a do conjunto). Com um só, o alvo passa a ser a página — antes esse caso
   * simplesmente não fazia nada, que era o comportamento que os usuários
   * reportavam como "o alinhamento não funciona".
   */
  /** G3: alinhar/distribuir movem nó por nó; com célula de grade na seleção, bloqueado com motivo no MVP */
  const bloqueadoPelaGrade = React.useCallback(() => {
    if (!selecaoTocaGrade(designAtualRef.current.layers, selectedLayerIdsRef.current)) return false
    toast({ description: MENSAGEM_ALINHAR_GRADE })
    return true
  }, [])

  const alinharSelecao = React.useCallback(
    (axis: AlignAxis, mode: AlignMode, forcarCanvas = false) => {
      if (bloqueadoPelaGrade()) return
      const colhido = colherNodesSelecionados()
      if (!colhido) return
      const { contentLayer, nodes } = colhido

      import('@/lib/konva-alignment').then((alinhamento) => {
        if (!forcarCanvas && nodes.length >= 2) {
          const entreSi = {
            x: { start: alinhamento.alignLeft, center: alinhamento.alignCenterH, end: alinhamento.alignRight },
            y: { start: alinhamento.alignTop, center: alinhamento.alignMiddleV, end: alinhamento.alignBottom },
          }[axis][mode]
          entreSi(nodes, contentLayer)
        } else {
          const canvasSize = axis === 'x' ? design.canvas.width : design.canvas.height
          alinhamento.alignToCanvas(nodes, contentLayer, axis, mode, canvasSize)
        }
        persistirPosicoes(nodes)
      })
    },
    [bloqueadoPelaGrade, colherNodesSelecionados, persistirPosicoes, design.canvas.width, design.canvas.height],
  )

  const alignSelectedLeft = React.useCallback(() => alinharSelecao('x', 'start'), [alinharSelecao])
  const alignSelectedCenterH = React.useCallback(() => alinharSelecao('x', 'center'), [alinharSelecao])
  const alignSelectedRight = React.useCallback(() => alinharSelecao('x', 'end'), [alinharSelecao])
  const alignSelectedTop = React.useCallback(() => alinharSelecao('y', 'start'), [alinharSelecao])
  const alignSelectedMiddleV = React.useCallback(() => alinharSelecao('y', 'center'), [alinharSelecao])
  const alignSelectedBottom = React.useCallback(() => alinharSelecao('y', 'end'), [alinharSelecao])

  const distributeSelectedH = React.useCallback(() => {
    if (bloqueadoPelaGrade()) return
    const stage = stageInstanceRef.current
    if (!stage || selectedLayerIds.length < 3) return

    const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined
    if (!contentLayer) return

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    if (nodes.length < 3) return

    import('@/lib/konva-alignment').then(({ distributeHorizontal }) => {
      distributeHorizontal(nodes, contentLayer)
      nodes.forEach(({ node, layer }) => {
        updateLayer(layer.id, (l) => ({
          ...l,
          position: { x: node.x(), y: node.y() },
        }))
      })
    })
  }, [bloqueadoPelaGrade, selectedLayerIds, design.layers, updateLayer])

  const distributeSelectedV = React.useCallback(() => {
    if (bloqueadoPelaGrade()) return
    const stage = stageInstanceRef.current
    if (!stage || selectedLayerIds.length < 3) return

    const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined
    if (!contentLayer) return

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    if (nodes.length < 3) return

    import('@/lib/konva-alignment').then(({ distributeVertical }) => {
      distributeVertical(nodes, contentLayer)
      nodes.forEach(({ node, layer }) => {
        updateLayer(layer.id, (l) => ({
          ...l,
          position: { x: node.x(), y: node.y() },
        }))
      })
    })
  }, [bloqueadoPelaGrade, selectedLayerIds, design.layers, updateLayer])

  const bringSelectedToFront = React.useCallback(() => {
    const stage = stageInstanceRef.current
    if (!stage || selectedLayerIds.length === 0) return

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    import('@/lib/konva-alignment').then(({ bringToFront }) => {
      const newLayers = bringToFront(nodes, design.layers)
      applyDesign(() => ({ ...design, layers: normalizeLayerOrder(newLayers) }))
    })
  }, [selectedLayerIds, design, applyDesign])

  const sendSelectedToBack = React.useCallback(() => {
    const stage = stageInstanceRef.current
    if (!stage || selectedLayerIds.length === 0) return

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    import('@/lib/konva-alignment').then(({ sendToBack }) => {
      const newLayers = sendToBack(nodes, design.layers)
      applyDesign(() => ({ ...design, layers: normalizeLayerOrder(newLayers) }))
    })
  }, [selectedLayerIds, design, applyDesign])

  const moveSelectedForward = React.useCallback(() => {
    const stage = stageInstanceRef.current
    if (!stage || selectedLayerIds.length === 0) return

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    import('@/lib/konva-alignment').then(({ moveForward }) => {
      const newLayers = moveForward(nodes, design.layers)
      applyDesign(() => ({ ...design, layers: normalizeLayerOrder(newLayers) }))
    })
  }, [selectedLayerIds, design, applyDesign])

  const moveSelectedBackward = React.useCallback(() => {
    const stage = stageInstanceRef.current
    if (!stage || selectedLayerIds.length === 0) return

    const nodes = selectedLayerIds
      .map((id) => {
        const node = stage.findOne(`#${id}`)
        const layer = design.layers.find((l) => l.id === id)
        return node && layer ? { node, layer } : null
      })
      .filter((item): item is { node: Konva.Node; layer: Layer } => Boolean(item))

    import('@/lib/konva-alignment').then(({ moveBackward }) => {
      const newLayers = moveBackward(nodes, design.layers)
      applyDesign(() => ({ ...design, layers: normalizeLayerOrder(newLayers) }))
    })
  }, [selectedLayerIds, design, applyDesign])

  // Centralizar na página, independente de quantos elementos estão
  // selecionados (com vários, move o conjunto sem desmanchar o arranjo)
  const alignSelectedToCanvasCenterH = React.useCallback(
    () => alinharSelecao('x', 'center', true),
    [alinharSelecao],
  )
  const alignSelectedToCanvasCenterV = React.useCallback(
    () => alinharSelecao('y', 'center', true),
    [alinharSelecao],
  )

  const selectedLayerId = selectedLayerIds[selectedLayerIds.length - 1] ?? null

  const value = React.useMemo<TemplateEditorContextValue>(
    () => ({
      templateId: template.id,
      projectId: template.projectId,
      name,
      setName: (next) => {
        setName(next)
        setDirty(true)
      },
      type: template.type,
      dimensions: template.dimensions,
      design,
      setDesign,
      selectedLayerIds,
      selectedLayerId,
      selectLayer,
      selectLayers,
      toggleLayerSelection,
      clearLayerSelection,
      groupSelectedLayers,
      ungroupLayers,
      updateLayer,
      updateLayerPartial,
      updateLayerStyle,
      moveLayer,
      addLayer,
      inserirGrade,
      planejarPreenchimento,
      preencherGrade,
      adicionarFotoAvulsa,
      planejarAjusteDaGrade,
      aplicarAjusteDaGrade,
      moverSelecao,
      desvincularGrade,
      applySoftTopGradient,
      duplicateLayer,
      removeLayer,
      removeLayers,
      toggleLayerVisibility,
      toggleLayerLock,
      reorderLayers,
      updateCanvas,
      setPageAudio,
      dynamicFields,
      setDynamicFields: (updater) => {
        setDynamicFieldsState((prev) => {
          const next = typeof updater === 'function' ? (updater as (prev: DynamicField[]) => DynamicField[])(prev) : updater
          setDirty(true)
          return next
        })
      },
      dirty,
      geracaoDaCarga,
      markSaved,
      zoom,
      focusTextMode,
      setFocusTextMode,
      setZoom,
      zoomIn,
      zoomOut,
      copySelectedLayers,
      pasteLayers,
      loadTemplate,
      undo,
      redo,
      canUndo: historyMeta.canUndo,
      canRedo: historyMeta.canRedo,
      isExporting,
      exportHistory,
      generateThumbnail,
      exportStageDataUrl,
      exportDesign,
      removeExport,
      clearExports,
      setStageInstance,
      getStageInstance,
      forceUpdate,
      alignSelectedLeft,
      alignSelectedCenterH,
      alignSelectedRight,
      alignSelectedTop,
      alignSelectedMiddleV,
      alignSelectedBottom,
      distributeSelectedH,
      distributeSelectedV,
      bringSelectedToFront,
      sendSelectedToBack,
      moveSelectedForward,
      moveSelectedBackward,
      alignSelectedToCanvasCenterH,
      alignSelectedToCanvasCenterV,
      pendingAIImageEdit,
      setPendingAIImageEdit,
      croppingLayerId,
      setCroppingLayerId,
    }),
    [
      template.id,
      template.projectId,
      template.type,
      template.dimensions,
      design,
      selectedLayerIds,
      selectedLayerId,
      selectLayer,
      selectLayers,
      toggleLayerSelection,
      clearLayerSelection,
      groupSelectedLayers,
      ungroupLayers,
      updateLayer,
      updateLayerPartial,
      updateLayerStyle,
      moveLayer,
      addLayer,
      inserirGrade,
      planejarPreenchimento,
      preencherGrade,
      adicionarFotoAvulsa,
      planejarAjusteDaGrade,
      aplicarAjusteDaGrade,
      moverSelecao,
      desvincularGrade,
      applySoftTopGradient,
      duplicateLayer,
      removeLayer,
      removeLayers,
      toggleLayerVisibility,
      toggleLayerLock,
      reorderLayers,
      updateCanvas,
      setPageAudio,
      dynamicFields,
      dirty,
      geracaoDaCarga,
      markSaved,
      zoom,
      focusTextMode,
      setZoom,
      zoomIn,
      zoomOut,
      name,
      copySelectedLayers,
      pasteLayers,
      loadTemplate,
      undo,
      redo,
      historyMeta.canUndo,
      historyMeta.canRedo,
      isExporting,
      exportHistory,
      generateThumbnail,
      exportStageDataUrl,
      exportDesign,
      removeExport,
      clearExports,
      setStageInstance,
      getStageInstance,
      forceUpdate,
      alignSelectedLeft,
      alignSelectedCenterH,
      alignSelectedRight,
      alignSelectedTop,
      alignSelectedMiddleV,
      alignSelectedBottom,
      distributeSelectedH,
      distributeSelectedV,
      bringSelectedToFront,
      sendSelectedToBack,
      moveSelectedForward,
      moveSelectedBackward,
      alignSelectedToCanvasCenterH,
      alignSelectedToCanvasCenterV,
      pendingAIImageEdit,
      croppingLayerId,
    ],
  )

  return <TemplateEditorContext.Provider value={value}>{children}</TemplateEditorContext.Provider>
}

export function useTemplateEditor() {
  const ctx = React.useContext(TemplateEditorContext)
  if (!ctx) {
    throw new Error('useTemplateEditor must be used within a TemplateEditorProvider')
  }
  return ctx
}

export function createDefaultLayer(type: Layer['type']): Layer {
  const id = createId()
  const base: Layer = {
    id,
    type,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${id.slice(0, 4)}`,
    visible: true,
    locked: false,
    order: 0,
    position: { x: 100, y: 100 },
    size: { width: 240, height: 120 },
    style: {},
    content: type === 'text' ? 'Texto exemplo' : undefined,
  }

  switch (type) {
    case 'text':
      return {
        ...base,
        style: {
          fontSize: 36,
          fontFamily: FONT_CONFIG.DEFAULT_FONT,
          fontWeight: '400',
          color: '#111111',
          textAlign: 'left',
          lineHeight: 1,
        },
        textboxConfig: {
          textMode: 'auto-wrap-fixed',
          anchor: 'top',
          autoWrap: {
            lineHeight: 1,
            breakMode: 'word',
            // Texto novo já acompanha a quebra de linha. Combinações e artes
            // geradas continuam desligando, para não perder a altura salva
            autoExpand: true,
          },
        },
      }
    case 'gradient':
    case 'gradient2':
      return {
        ...base,
        size: { width: 320, height: 320 },
        style: {
          gradientType: 'linear',
          gradientAngle: 180,
          gradientStops: [
            { id: '1', color: '#000000', position: 0, opacity: 1 },
            { id: '2', color: '#000000', position: 1, opacity: 0 },
          ],
        },
      }
    case 'image':
    case 'logo':
    case 'element':
      return {
        ...base,
        size: { width: 320, height: 320 },
        style: {
          objectFit: 'cover',
          border: { width: 0, color: '#000000', radius: 0 },
          blur: 0,
          brightness: 0,
          contrast: 0,
        },
        fileUrl: '',
      }
    case 'shape':
      return {
        ...base,
        type: 'shape',
        size: { width: 240, height: 240 },
        style: {
          fill: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#1e3a8a',
          strokeOpacity: 1,
          strokeWidth: 2,
          shapeType: 'rectangle',
        },
      }
    case 'icon':
      return {
        ...base,
        type: 'icon',
        size: { width: 120, height: 120 },
        style: {
          fill: '#111111',
          strokeWidth: 0,
          iconId: 'star',
        },
        fileUrl: '',
      }
    case 'video':
      return {
        ...base,
        type: 'video',
        name: 'Vídeo de Fundo',
        size: {
          width: 1080,
          height: 1920,
        },
        position: { x: 0, y: 0 },
        fileUrl: '',
        videoMetadata: {
          autoplay: true,
          loop: true,
          muted: true,
          objectFit: 'cover',
          playbackRate: 1,
          currentTime: 0,
        },
      }
    default:
      return base
  }
}
