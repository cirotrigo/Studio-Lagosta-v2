"use client"

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, HardDrive, Loader2, FolderOpen, Image as ImageIcon, ChevronRight, ArrowLeft, Folder, Search, X } from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { useProject } from '@/hooks/use-project'
import { useAcervo } from '@/hooks/use-acervo'
import { useAprendizado } from '@/hooks/use-aprendizado'
import { useFotoNaGrade, type FonteDaFoto } from '@/hooks/use-preencher-grade'
import { LIMITE_DO_LOTE, gradeDaSelecao, mensagemDoDesfecho, vaziasEmLeitura, type DesfechoDoPreenchimento } from '@/lib/grades/preenchimento'
import { paginaEVideo } from '@/lib/video/camadas-de-video'
import { BarraDoLote, alternarNoLote, type ContextoDaBusca, type EscolhaDoLote } from './lote-da-grade'
import type { GoogleDriveItem } from '@/types/google-drive'
import type { Layer } from '@/types/template'

interface BreadcrumbItem {
  id: string
  name: string
}

export function ImagesPanelContent() {
  const { addLayer, design, projectId, selectedLayerIds, planejarPreenchimento } = useTemplateEditor()
  const { toast } = useToast()
  const { data: project } = useProject(projectId)
  // G2: grade selecionada recebe a foto; o lote junta fotos em ordem e aplica numa operação só
  const { planejar: planejarFoto, colocar: colocarNaGrade, preencher, cancelar: cancelarPreenchimento, emVoo } = useFotoNaGrade()
  const [lote, setLote] = React.useState<EscolhaDoLote[] | null>(null)
  const selecaoDaGrade = gradeDaSelecao(design.layers, selectedLayerIds)
  const vagas = selecaoDaGrade && !selecaoDaGrade.celulaId ? vaziasEmLeitura(design.layers, selecaoDaGrade.gradeId).length : 0
  const limiteDoLote = Math.min(LIMITE_DO_LOTE, vagas)
  const proximoArquivoRef = React.useRef(0)
  const adicionarArquivos = React.useCallback(
    (arquivos: File[]) => {
      const novas = arquivos
        .filter((arquivo) => arquivo.type.startsWith('image/'))
        .map((arquivo): EscolhaDoLote => ({ chave: `arquivo:${++proximoArquivoRef.current}`, tipo: 'arquivo', arquivo, nome: arquivo.name }))
      setLote((atual) => atual && novas.reduce((l, e) => alternarNoLote(l, e, limiteDoLote), atual))
    },
    [limiteDoLote],
  )

  const [isDragging, setIsDragging] = React.useState(false)
  const [driveItems, setDriveItems] = React.useState<GoogleDriveItem[]>([])
  const [isLoadingDrive, setIsLoadingDrive] = React.useState(false)
  const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isApplyingMedia, setIsApplyingMedia] = React.useState(false)
  const [nextPageToken, setNextPageToken] = React.useState<string | undefined>(undefined)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)
  const initializedFolderKeyRef = React.useRef<string | null>(null)

  // Busca semântica no acervo (mesmo catálogo do picker da bancada).
  const [busca, setBusca] = React.useState('')
  const [temaAtivo, setTemaAtivo] = React.useState('')
  const [limiteBusca, setLimiteBusca] = React.useState(40)
  const buscaAtiva = temaAtivo.length > 0
  const {
    data: resultadoBusca,
    isLoading: isBuscando,
    isFetching: isBuscandoMais,
  } = useAcervo(projectId, { tema: temaAtivo, limite: limiteBusca, enabled: buscaAtiva })
  const { registrarDesfecho } = useAprendizado(projectId, 'editor')
  /**
   * Buscas cujo desfecho já foi fechado nesta sessão. O sinal a colher é
   * "desta lista, o que a pessoa levou PRIMEIRO" — uma escolha só por busca,
   * como no ArteIaImagePicker.
   */
  const buscasFechadas = React.useRef<Set<string>>(new Set())
  /** A busca aberta NESTE toque (lista ranqueada, topo, posição da foto): segue com a escolha até o registro */
  const contextoDaBusca = (driveFileId: string): ContextoDaBusca | undefined => {
    const sugestaoId = resultadoBusca?.sugestaoId
    if (!sugestaoId) return undefined
    const posicao = (resultadoBusca?.images ?? []).findIndex((i) => i.driveFileId === driveFileId)
    return { sugestaoId, propostaTopo: resultadoBusca?.propostaTopo ?? null, ...(posicao >= 0 ? { posicao: posicao + 1 } : {}) }
  }
  /**
   * O que a pessoa escolheu, comparado com o que o acervo propôs. A ordem da
   * lista é a recomendação (menos usada primeiro); levar a primeira é aceitar
   * a proposta. Sem isto o ranqueamento nunca fica sabendo que erra.
   * G2: na grade o registro só acontece com a foto APLICADA, e vai para a busca de onde ela saiu (`ContextoDaBusca`).
   */
  const registrarEscolha = React.useCallback(
    (busca: ContextoDaBusca, driveFileId: string) => {
      if (buscasFechadas.current.has(busca.sugestaoId)) return
      buscasFechadas.current.add(busca.sugestaoId)
      registrarDesfecho({
        sugestaoId: busca.sugestaoId,
        desfecho: driveFileId === busca.propostaTopo ? 'aceita-como-veio' : 'trocada',
        escolhido: { driveFileId, ...(busca.posicao ? { posicao: busca.posicao } : {}) },
      })
    },
    [registrarDesfecho],
  )

  const { upload: uploadToBlob, isUploading } = useBlobUpload()

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const driveFolderId =
    project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId ?? null
  const driveFolderName =
    project?.googleDriveImagesFolderName ?? project?.googleDriveFolderName ?? null

  // Insert image layer with exact canvas size
  const insertImageLayer = React.useCallback(
    // G2: `inserir` é o `addLayer` de sempre; da grade cheia, `adicionarFotoAvulsa` (sem clipe)
    (url: string, name?: string, inserir: (camada: Layer) => void = addLayer) => {
      // Imagem sempre tem exatamente o tamanho do canvas
      const base = createDefaultLayer('image')
      const layer = {
        ...base,
        name: name ? `Imagem - ${name}` : 'Imagem',
        fileUrl: url,
        position: { x: 0, y: 0 },
        size: { width: canvasWidth, height: canvasHeight },
        style: {
          ...base.style,
          objectFit: 'cover' as const,
        },
      }

      inserir(layer)
      toast({
        title: 'Imagem adicionada',
        description: 'A imagem foi ajustada ao tamanho do canvas.'
      })
    },
    [addLayer, canvasWidth, canvasHeight, toast],
  )

  const avisarPreenchimento = React.useCallback(
    (d: DesfechoDoPreenchimento) => {
      const m = mensagemDoDesfecho(d)
      toast({ description: m.texto, ...(m.erro ? { variant: 'destructive' as const } : {}) })
    },
    [toast],
  )

  /**
   * G2 · foto única de qualquer entrada deste painel (upload, arrastar, Drive, acervo), pelo contrato de
   * `useFotoNaGrade`: o alvo é decidido AQUI, antes de subir ou baixar; a avulsa monta a camada como sempre e a entrega
   * a `inserir` (`addLayer` sem grade; sem clipe quando a grade está cheia).
   */
  const colocarFoto = React.useCallback(
    (fonte: FonteDaFoto, avulsa: (inserir: (camada: Layer) => void) => Promise<void>) => colocarNaGrade(planejarFoto(), fonte, avulsa),
    [colocarNaGrade, planejarFoto],
  )

  // Load Google Drive files
  const loadDriveFiles = React.useCallback(async (folderId: string, folderName?: string, pageToken?: string) => {
    const isLoadingMore = Boolean(pageToken)

    if (isLoadingMore) {
      setIsLoadingMore(true)
    } else {
      setIsLoadingDrive(true)
      setDriveItems([]) // Clear items on fresh load
      setNextPageToken(undefined)
    }

    try {
      // Build URL with pagination support
      const params = new URLSearchParams({
        folderId,
        mode: 'images',
      })
      if (pageToken) {
        params.append('pageToken', pageToken)
      }

      const response = await fetch(`/api/google-drive/files?${params.toString()}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[ImagesPanel] API Error:', errorText)
        throw new Error('Falha ao carregar arquivos do Drive')
      }

      const data = await response.json()

      // The API returns 'items' and 'nextPageToken'
      const items = data.items || []
      const newNextPageToken = data.nextPageToken

      // Append items if loading more, otherwise replace
      setDriveItems(prev => isLoadingMore ? [...prev, ...items] : items)
      setNextPageToken(newNextPageToken)
    } catch (_error) {
      console.error('[ImagesPanel] Failed to load Drive files', _error)
      toast({
        title: 'Erro ao carregar Drive',
        description: _error instanceof Error ? _error.message : 'Não foi possível carregar os arquivos do Google Drive.',
        variant: 'destructive',
      })
      if (!isLoadingMore) {
        setDriveItems([])
        setNextPageToken(undefined)
      }
    } finally {
      if (isLoadingMore) {
        setIsLoadingMore(false)
      } else {
        setIsLoadingDrive(false)
      }
    }
  }, [toast])

  // Navigate to folder
  const navigateToFolder = React.useCallback((folderId: string, folderName: string) => {
    // Add to breadcrumbs if not already there
    setBreadcrumbs((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === folderId)
      if (existingIndex !== -1) {
        // Going back - trim breadcrumbs
        return prev.slice(0, existingIndex + 1)
      } else {
        // Going forward - add new breadcrumb
        return [...prev, { id: folderId, name: folderName }]
      }
    })
    loadDriveFiles(folderId, folderName)
  }, [loadDriveFiles])

  // Navigate back
  const navigateBack = React.useCallback(() => {
    if (breadcrumbs.length <= 1) return
    const previousFolder = breadcrumbs[breadcrumbs.length - 2]
    navigateToFolder(previousFolder.id, previousFolder.name)
  }, [breadcrumbs, navigateToFolder])

  // Load more items (pagination)
  const loadMoreItems = React.useCallback(() => {
    const currentFolder = breadcrumbs[breadcrumbs.length - 1]
    if (currentFolder && nextPageToken) {
      loadDriveFiles(currentFolder.id, currentFolder.name, nextPageToken)
    }
  }, [breadcrumbs, nextPageToken, loadDriveFiles])

  // Load Drive files on mount
  React.useEffect(() => {
    if (driveFolderId && driveFolderName) {
      const folderKey = `${driveFolderId}:${driveFolderName}`
      if (initializedFolderKeyRef.current === folderKey) {
        return
      }

      initializedFolderKeyRef.current = folderKey
      setBreadcrumbs([{ id: driveFolderId, name: driveFolderName }])
      void loadDriveFiles(driveFolderId, driveFolderName)
    } else {
      initializedFolderKeyRef.current = null
    }
  }, [driveFolderId, driveFolderName, loadDriveFiles])

  // File upload (avulsa: o caminho de sempre)
  const uploadAvulso = React.useCallback(
    async (file: File, inserir?: (camada: Layer) => void) => {
      setIsApplyingMedia(true)
      try {
        // Client-side upload direto ao Vercel Blob
        const url = await uploadToBlob(file)
        insertImageLayer(url, file.name, inserir)

        toast({
          title: 'Upload concluído',
          description: 'A imagem foi enviada com sucesso.',
        })
      } catch (_error) {
        console.error('[ImagesPanel] Upload failed', _error)
        toast({
          title: 'Erro ao enviar imagem',
          description: _error instanceof Error ? _error.message : 'Não foi possível enviar a imagem.',
          variant: 'destructive',
        })
      } finally {
        setIsApplyingMedia(false)
      }
    },
    [insertImageLayer, toast, uploadToBlob],
  )

  const uploadFile = React.useCallback(
    async (file: File) => {
      // lote aberto: o arquivo entra na fila, na ordem, e só sobe ao "Preencher"
      if (lote) return adicionarArquivos([file])
      await colocarFoto({ tipo: 'arquivo', arquivo: file, nome: file.name }, (inserir) => uploadAvulso(file, inserir))
    },
    [adicionarArquivos, colocarFoto, lote, uploadAvulso],
  )

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        await uploadFile(file)
        if (event.target) event.target.value = ''
      }
    },
    [uploadFile],
  )

  // Drag and drop handlers
  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((file) => file.type.startsWith('image/'))

      if (imageFile) {
        await uploadFile(imageFile)
      } else {
        toast({
          title: 'Arquivo inválido',
          description: 'Por favor, arraste apenas arquivos de imagem.',
          variant: 'destructive',
        })
      }
    },
    [uploadFile, toast],
  )

  // Import from Google Drive (avulsa: o caminho de sempre)
  const importDriveAvulso = React.useCallback(async (fileId: string, fileName: string, inserir?: (camada: Layer) => void) => {
    setIsApplyingMedia(true)
    try {
      const response = await fetch('/api/upload/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao importar arquivo do Google Drive')
      }
      const uploaded = (await response.json()) as { url?: string; name?: string }
      if (!uploaded.url) {
        throw new Error('Falha ao importar arquivo do Google Drive')
      }
      insertImageLayer(uploaded.url, uploaded.name ?? fileName, inserir)
    } catch (_error) {
      console.error('[ImagesPanel] Drive import failed', _error)
      toast({
        title: 'Erro ao importar do Drive',
        description: _error instanceof Error ? _error.message : 'Não foi possível copiar o arquivo.',
        variant: 'destructive',
      })
    } finally {
      setIsApplyingMedia(false)
    }
  }, [insertImageLayer, toast])

  // Drive e acervo: na grade, a rota do projeto (Blob próprio, nunca data:); fora dela, a de sempre
  const importDriveFile = React.useCallback(
    async (fileId: string, fileName: string, busca?: ContextoDaBusca) => {
      const r = await colocarFoto({ tipo: 'drive', id: fileId, nome: fileName }, (inserir) => {
        if (busca) registrarEscolha(busca, fileId) // avulsa: o sinal sai no clique, como sempre
        return importDriveAvulso(fileId, fileName, inserir)
      })
      if (busca && 'ok' in r && r.ok) registrarEscolha(busca, fileId) // célula: só com a foto aplicada
    },
    [colocarFoto, importDriveAvulso, registrarEscolha],
  )

  /** Com o lote aberto, tocar numa foto do Drive/acervo a põe (ou tira) da fila, na ordem; nada é baixado ainda */
  const escolherNoLote = React.useCallback(
    (id: string, nome: string, busca?: ContextoDaBusca) =>
      setLote((atual) => (atual ? alternarNoLote(atual, { chave: `drive:${id}`, tipo: 'drive', id, nome, ...(busca ? { busca } : {}) }, limiteDoLote) : atual)),
    [limiteDoLote],
  )
  const numeroNoLote = (id: string) => {
    const i = lote?.findIndex((e) => e.chave === `drive:${id}`) ?? -1
    return i >= 0 ? i + 1 : undefined
  }

  const preencherLote = React.useCallback(async () => {
    if (!lote?.length) return
    const plano = planejarPreenchimento(lote.length)
    if (plano.tipo !== 'grade') {
      toast({ variant: 'destructive', description: plano.tipo === 'recusa' ? plano.mensagem : 'Selecione a grade inteira.' })
      return
    }
    const fontes: FonteDaFoto[] = lote.map((e) => (e.tipo === 'drive' ? { tipo: 'drive', id: e.id, nome: e.nome } : { tipo: 'arquivo', arquivo: e.arquivo, nome: e.nome }))
    const r = await preencher(plano.alvo, fontes)
    avisarPreenchimento(r)
    if (!r.ok) return
    // sinal do acervo só das fotos APLICADAS, cada uma para a busca de onde saiu (uma escolha por busca)
    lote.forEach((e, i) => {
      if (e.tipo === 'drive' && e.busca && r.aplicadas.includes(plano.alvo.celulas[i])) registrarEscolha(e.busca, e.id)
    })
    setLote(null)
  }, [avisarPreenchimento, lote, planejarPreenchimento, preencher, registrarEscolha, toast])

  // Handle file/folder click
  const handleDriveItemClick = React.useCallback((item: GoogleDriveItem) => {
    if (isApplyingMedia || emVoo) {
      return
    }
    if (item.kind === 'folder') {
      // Navigate into folder
      navigateToFolder(item.id, item.name)
    } else if (lote) {
      escolherNoLote(item.id, item.name)
    } else {
      // Import image
      void importDriveFile(item.id, item.name)
    }
  }, [navigateToFolder, importDriveFile, isApplyingMedia, emVoo, lote, escolherNoLote])

  const limparBusca = React.useCallback(() => {
    setBusca('')
    setTemaAtivo('')
    setLimiteBusca(40)
  }, [])

  const isBusy = isUploading || isApplyingMedia
  const ocupado = isBusy || emVoo
  const selo = (id: string) => {
    const n = numeroNoLote(id)
    return n ? <span className="absolute left-1 top-1 z-10 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{n}</span> : null
  }

  const driveFolders = driveItems.filter((item) => item.kind === 'folder')
  const driveFiles = driveItems.filter((item) => item.kind !== 'folder')

  /**
   * Breadcrumbs compactados: o painel tem ~224px úteis (aside w-64), então a
   * partir de 4 níveis mostramos raiz … últimos dois. Os intermediários
   * continuam alcançáveis pelo botão de voltar.
   */
  const visibleCrumbs: Array<BreadcrumbItem | null> =
    breadcrumbs.length > 3
      ? [breadcrumbs[0], null, ...breadcrumbs.slice(-2)]
      : breadcrumbs

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <BarraDoLote
        selecao={selecaoDaGrade ? (selecaoDaGrade.celulaId ? { tipo: 'celula' } : { tipo: 'grade', vagas }) : null}
        video={paginaEVideo(design.layers, design.audio)}
        lote={lote}
        emVoo={emVoo}
        onAbrir={() => setLote([])}
        onRemover={(chave) => setLote((l) => l && l.filter((e) => e.chave !== chave))}
        onArquivos={adicionarArquivos}
        onPreencher={() => void preencherLote()}
        onCancelar={emVoo ? cancelarPreenchimento : () => setLote(null)}
      />

      <Tabs defaultValue="drive" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/40 p-1 rounded-lg border border-border/20">
          <TabsTrigger
            value="drive"
            className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
          >
            <HardDrive className="mr-1.5 h-3.5 w-3.5" />
            Google Drive
          </TabsTrigger>
          <TabsTrigger
            value="upload"
            className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload
          </TabsTrigger>
        </TabsList>

        {/* Google Drive Tab - First */}
        <TabsContent value="drive" className="mt-2 space-y-2">
          {/* Busca semântica no acervo — cobre o catálogo inteiro, não só a pasta aberta */}
          {driveFolderId && (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                const tema = busca.trim()
                if (!tema) {
                  limparBusca()
                  return
                }
                setTemaAtivo(tema)
                setLimiteBusca(40)
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar: picanha, happy hour…"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="h-8 px-2.5 text-xs">
                Buscar
              </Button>
            </form>
          )}

          {buscaAtiva ? (
            /* ── Resultados da busca semântica ─────────────────────────── */
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                  Resultados para <span className="font-medium text-foreground">“{temaAtivo}”</span>
                </p>
                <button
                  type="button"
                  onClick={limparBusca}
                  className="flex flex-shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <X className="h-3 w-3" />
                  Limpar
                </button>
              </div>

              {resultadoBusca?.aviso && (
                <p className="text-[11px] italic text-amber-600 dark:text-amber-500">
                  {resultadoBusca.aviso}
                </p>
              )}

              {isBuscando && !resultadoBusca ? (
                <div className="grid grid-cols-3 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : !resultadoBusca || resultadoBusca.images.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
                  <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhuma foto encontrada</p>
                  <button
                    type="button"
                    onClick={limparBusca}
                    className="mt-1 text-xs text-primary underline"
                  >
                    Limpar a busca e voltar às pastas
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {resultadoBusca.images.map((img) => (
                      <button
                        key={img.driveFileId}
                        type="button"
                        onClick={() => {
                          if (ocupado) return
                          // a busca deste toque segue com a escolha; o sinal só sai quando a foto é levada
                          const contexto = contextoDaBusca(img.driveFileId)
                          if (lote) escolherNoLote(img.driveFileId, img.fileName, contexto)
                          else void importDriveFile(img.driveFileId, img.fileName, contexto)
                        }}
                        disabled={ocupado}
                        title={`${img.menuItem ?? img.fileName}${img.folder ? ` · ${img.folder}` : ''}${
                          img.ultimoUso === 'nunca' ? ' · nunca usada' : ` · usada em ${img.ultimoUso}`
                        }`}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-card/50 transition-all hover:border-primary/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Image
                          src={`/api/drive/thumbnail/${img.driveFileId}`}
                          alt={img.fileName}
                          fill
                          sizes="120px"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          unoptimized
                        />
                        {selo(img.driveFileId)}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent p-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <p className="truncate text-[10px] font-medium text-white/90">
                            {img.menuItem ?? img.fileName}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      {resultadoBusca.images.length} de {resultadoBusca.total} · menos usadas primeiro
                    </p>
                    {resultadoBusca.images.length < resultadoBusca.total && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={isBuscandoMais}
                        onClick={() => setLimiteBusca((l) => l + 80)}
                      >
                        {isBuscandoMais ? 'Carregando…' : 'Carregar mais'}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── Navegação por pastas ───────────────────────────────────── */
            <>
              {/* Navigation Header - Compact */}
              {breadcrumbs.length > 0 && (
                <div className="flex items-center gap-2">
                  {breadcrumbs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={navigateBack}
                      className="h-7 w-7 p-0 flex-shrink-0"
                      title="Voltar"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Breadcrumbs */}
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground min-w-0">
                    {visibleCrumbs.map((crumb, index) => (
                      <React.Fragment key={crumb?.id ?? `ellipsis-${index}`}>
                        {index > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                        {crumb ? (
                          <button
                            onClick={() => navigateToFolder(crumb.id, crumb.name)}
                            className={`truncate max-w-[100px] hover:text-foreground ${
                              crumb.id === breadcrumbs[breadcrumbs.length - 1]?.id
                                ? 'font-medium text-foreground'
                                : ''
                            }`}
                            title={crumb.name}
                          >
                            {crumb.name}
                          </button>
                        ) : (
                          <span title="Use o botão de voltar para os níveis intermediários">…</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Files/Folders */}
              {!driveFolderId ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
                  <HardDrive className="mb-2 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Google Drive não configurado
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Configure nas configurações do projeto
                  </p>
                </div>
              ) : isLoadingDrive ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : driveItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
                  <FolderOpen className="mb-2 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Pasta vazia
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Nenhum arquivo encontrado
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Pastas em LISTA: o nome fica sempre visível, em qualquer
                      largura de painel. Na grade quadrada anterior o nome era
                      cortado pelo overflow do tile (~69px no aside w-64). */}
                  {driveFolders.length > 0 && (
                    <div className="space-y-1">
                      {driveFolders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => handleDriveItemClick(folder)}
                          disabled={ocupado}
                          title={folder.name}
                          className="group flex w-full items-center gap-2 rounded-lg border border-border/40 bg-card/50 px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Folder className="h-4 w-4 flex-shrink-0 text-primary/80" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                            {folder.name}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </button>
                      ))}
                    </div>
                  )}

                  {driveFolders.length > 0 && driveFiles.length > 0 && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Fotos ({driveFiles.length}{nextPageToken ? '+' : ''})
                    </p>
                  )}

                  {driveFiles.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {driveFiles.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleDriveItemClick(item)}
                          disabled={ocupado}
                          title={item.name}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-card/50 transition-all hover:border-primary/50 hover:bg-muted/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {selo(item.id)}
                          {item.thumbnailLink ? (
                            <div className="relative h-full w-full">
                              <Image
                                src={item.thumbnailLink}
                                alt={item.name}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent p-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                            <p className="truncate text-[10px] font-medium text-white/90">
                              {item.name}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Load More Button */}
                  {nextPageToken && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreItems}
                        disabled={isLoadingMore || isApplyingMedia}
                        className="w-full h-8 text-xs"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Carregando...
                          </>
                        ) : (
                          'Carregar mais'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Upload Tab - Second with Drag & Drop */}
        <TabsContent value="upload" className="mt-2">
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300 ${isDragging
              ? 'border-primary bg-primary/5 scale-[0.99]'
              : 'border-border/40 hover:border-primary/50 hover:bg-muted/30'
              }`}
            onClick={() => {
              if (!ocupado) {
                fileInputRef.current?.click()
              }
            }}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative mb-4">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <Loader2 className="relative h-10 w-10 animate-spin text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Enviando imagem...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="mb-4 rounded-full bg-muted/50 p-3 ring-1 ring-border/50 transition-all group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-primary">
                  <Upload className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  {isDragging ? 'Solte a imagem aqui' : 'Clique ou arraste imagens'}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  PNG, JPG, GIF até 100MB
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {isBusy && (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-background/80 backdrop-blur-sm">
          {/* O conteúdo agora rola no host (sem ScrollArea de altura fixa), então
              o overlay pode ficar mais alto que a janela — o sticky mantém o
              spinner à vista. Estilo inline: top-1/3 não existe no repo. */}
          <div
            className="flex items-center gap-2 text-sm font-medium text-foreground"
            style={{ position: 'sticky', top: '35vh' }}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Aplicando imagem...
          </div>
        </div>
      )}
    </div>
  )
}
