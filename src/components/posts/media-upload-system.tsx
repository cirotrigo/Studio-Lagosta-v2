'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, FolderIcon, UploadIcon, X, Loader2, Sparkles } from 'lucide-react'
import { GenerationsSelector } from './generations-selector'
import { AIImagesSelector } from './ai-images-selector'
import { LocalFileUploader } from './local-file-uploader'
import { SortableMediaItem } from './sortable-media-item'
import { GoogleDriveInlineSelector } from './google-drive-inline-selector'
import type { GoogleDriveItem } from '@/types/google-drive'
import { toast } from 'sonner'
import { CropDialog, centeredCrop, matchesPostRatio } from './crop/crop-dialog'
import {
  readImageSizeFromUrl,
  type CropPostType,
  type CropRegion,
} from '@/lib/images/client-resize'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import Image from 'next/image'
import { useProject } from '@/hooks/use-project'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'

interface MediaItem {
  id: string
  type: 'generation' | 'ai-image' | 'google-drive' | 'upload'
  url: string
  pathname?: string // Blob pathname for cleanup
  thumbnailUrl?: string
  name: string
  size?: number
  mimeType?: string
  /** Já passou pelo enquadramento — a URL é a da imagem recortada */
  cropped?: boolean
  /**
   * Mídia que JÁ ESTAVA no post ao abrir a edição (não foi escolhida agora).
   *
   * Ela chega como `type: 'upload'` porque não se sabe de onde veio, mas
   * "upload" ali significa duas coisas diferentes: arquivo que a pessoa acabou
   * de subir (e já passou pelo enquadramento do uploader) e slide que está no
   * post há dias, que nunca passou por enquadramento nenhum. Sem esta marca,
   * os slides 2..N de um carrossel agendado ficavam sem o botão de enquadrar.
   */
  preexistente?: boolean
}

/** Imagem escolhida que ainda espera a decisão de enquadramento */
interface PendenteDeCrop {
  id: string
  url: string
  naturalSize: { width: number; height: number }
}

const EXTENSOES_VIDEO = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']

function ehVideo(item: MediaItem): boolean {
  if (item.mimeType?.startsWith('video/')) return true
  const alvo = `${item.url ?? ''} ${item.name ?? ''}`.toLowerCase()
  return EXTENSOES_VIDEO.some((ext) => alvo.includes(ext))
}

interface MediaUploadSystemProps {
  projectId: number
  selectedMedia: MediaItem[]
  // Accepts a new array OR a functional updater. Prefer the functional form so
  // concurrent add/remove operations apply atomically against the latest state.
  onSelectionChange: (media: MediaItem[] | ((prev: MediaItem[]) => MediaItem[])) => void
  maxSelection: number
  postType?: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL'
}

interface Generation {
  id: string
  templateName: string
  resultUrl: string
  thumbnailUrl?: string | null
  createdAt: string
}

interface AIGeneratedImage {
  id: string
  name: string
  prompt: string
  fileUrl: string
  thumbnailUrl?: string | null
  width: number
  height: number
  createdAt: string
}

interface DownloadedDriveFile {
  id: string
  url: string
  pathname: string
  name: string
  size?: number
  mimeType?: string
}

interface UploadedFile {
  id: string
  url: string
  pathname: string
  name: string
  size: number
  preview: string
}

interface DownloadedAIImage {
  id: string
  url: string
  pathname: string
  name: string
}

interface GoogleDriveDownloadResponse {
  files: DownloadedDriveFile[]
  uploaded: number
}

interface AIImagesDownloadResponse {
  files: DownloadedAIImage[]
  uploaded: number
}

export function MediaUploadSystem({
  projectId,
  selectedMedia,
  onSelectionChange,
  maxSelection,
  postType = 'POST'
}: MediaUploadSystemProps) {
  const [activeTab, setActiveTab] = useState('generations')

  // Fetch project data to get configured Google Drive folders
  const { data: project } = useProject(projectId)

  // Determine media mode based on post type
  const mediaMode = useMemo(() => {
    if (postType === 'REEL') return 'videos' // Only videos for reels
    if (postType === 'STORY') return 'both' // Images and videos for stories
    return 'images' // Images only for POST and CAROUSEL
  }, [postType])

  // Determine which folder to open based on media mode
  const { initialFolderId, initialFolderName } = useMemo(() => {
    if (!project) return { initialFolderId: undefined, initialFolderName: undefined }

    if (mediaMode === 'videos') {
      // For videos (reels), use videos folder
      return {
        initialFolderId: project.googleDriveVideosFolderId || undefined,
        initialFolderName: project.googleDriveVideosFolderName || undefined,
      }
    } else if (mediaMode === 'images' || mediaMode === 'both') {
      // For images (posts/carousels) and both (stories), use images folder
      return {
        initialFolderId: project.googleDriveImagesFolderId || undefined,
        initialFolderName: project.googleDriveImagesFolderName || undefined,
      }
    }

    return { initialFolderId: undefined, initialFolderName: undefined }
  }, [project, mediaMode])

  // Latest "desired" ids per async source, updated on every selection change.
  // The download onSuccess consults these so an item the user deselected WHILE
  // its download was still in flight is not re-added when the download resolves.
  const desiredDriveIdsRef = useRef<Set<string>>(new Set())
  const desiredAIImageIdsRef = useRef<Set<string>>(new Set())

  // Mutation para download e upload de arquivos do Google Drive
  const downloadDriveMutation = useMutation<GoogleDriveDownloadResponse, Error, string[]>({
    mutationFn: async (fileIds) => {
      return api.post(`/api/google-drive-download`, { projectId, fileIds }) as Promise<GoogleDriveDownloadResponse>
    },
    onSuccess: (data) => {
      // Convert downloaded files to MediaItem format
      const newMedia: MediaItem[] = data.files.map((file) => ({
        id: file.id,
        type: 'google-drive' as const,
        url: file.url,
        pathname: file.pathname,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      }))

      // Append only the freshly downloaded items (by id) that are STILL desired,
      // keeping everything already selected. Order-independent (overlapping
      // downloads are safe) and ignores items deselected mid-download.
      onSelectionChange((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const additions = newMedia.filter(
          (m) => !existing.has(m.id) && desiredDriveIdsRef.current.has(m.id),
        )
        return additions.length > 0 ? [...prev, ...additions] : prev
      })
      toast.success(`${data.uploaded} arquivo(s) preparado(s)`)
    },
    onError: (error) => {
      console.error('Error downloading from Google Drive:', error)
      toast.error('Erro ao processar arquivos do Google Drive')
    },
  })

  // Mutation para download e upload de imagens de IA
  const downloadAIImagesMutation = useMutation<AIImagesDownloadResponse, Error, string[]>({
    mutationFn: async (imageIds) => {
      return api.post(`/api/ai-images-download`, { projectId, imageIds }) as Promise<AIImagesDownloadResponse>
    },
    onSuccess: (data) => {
      // Convert downloaded images to MediaItem format
      const newMedia: MediaItem[] = data.files.map((file) => ({
        id: file.id,
        type: 'ai-image' as const,
        url: file.url,
        pathname: file.pathname,
        name: file.name,
      }))

      // Append only the freshly downloaded items (by id) that are STILL desired.
      // Order-independent and ignores items deselected mid-download.
      onSelectionChange((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const additions = newMedia.filter(
          (m) => !existing.has(m.id) && desiredAIImageIdsRef.current.has(m.id),
        )
        return additions.length > 0 ? [...prev, ...additions] : prev
      })
      toast.success(`${data.uploaded} imagem(ns) de IA preparada(s)`)
    },
    onError: (error) => {
      console.error('Error downloading AI images:', error)
      toast.error('Erro ao processar imagens de IA')
    },
  })

  // Calculate remaining slots
  const remainingSlots = maxSelection - selectedMedia.length

  // Compute selected Google Drive IDs
  const selectedGoogleDriveIds = useMemo(() =>
    selectedMedia
      .filter(m => m.type === 'google-drive')
      .map(m => m.id),
    [selectedMedia]
  )

  const googleDriveMaxSelection = useMemo(() =>
    remainingSlots + selectedMedia.filter(m => m.type === 'google-drive').length,
    [remainingSlots, selectedMedia]
  )

  // Calculate max uploads for LocalFileUploader
  // Add back upload items to avoid double counting (since LocalFileUploader tracks its own state)
  const uploadMaxSelection = useMemo(() =>
    remainingSlots + selectedMedia.filter(m => m.type === 'upload').length,
    [remainingSlots, selectedMedia]
  )

  // Handler para seleção de Generations.
  // The selector always reports the COMPLETE list of selected generations, so we
  // atomically swap the 'generation' slice while preserving every other type.
  const handleGenerationsChange = useCallback((ids: string[], generations: Generation[]) => {
    onSelectionChange((prev) => {
      // O seletor reporta a lista inteira a cada toque, então quem já foi
      // enquadrado precisa ser preservado — senão a arte recortada voltaria
      // para a original ao marcar outro criativo
      const anteriores = new Map(
        prev.filter(m => m.type === 'generation').map(m => [m.id, m] as const),
      )
      const newMedia: MediaItem[] = generations.map(g => {
        const anterior = anteriores.get(g.id)
        if (anterior?.cropped) return anterior
        return {
          id: g.id,
          type: 'generation' as const,
          url: g.resultUrl,
          thumbnailUrl: g.thumbnailUrl || g.resultUrl,
          name: g.templateName,
        }
      })
      return [...prev.filter(m => m.type !== 'generation'), ...newMedia]
    })
  }, [onSelectionChange])

  // Handler para seleção de AI Images.
  // Removal is applied immediately and atomically (by id); only the newly added
  // ids are downloaded, then appended by id in the mutation's onSuccess.
  const handleAIImagesChange = useCallback(async (ids: string[], _aiImages: AIGeneratedImage[]) => {
    const desired = new Set(ids)
    desiredAIImageIdsRef.current = desired
    onSelectionChange((prev) => prev.filter(m => m.type !== 'ai-image' || desired.has(m.id)))

    const alreadyHave = new Set(
      selectedMedia.filter(m => m.type === 'ai-image').map(m => m.id),
    )
    const toDownload = ids.filter(id => !alreadyHave.has(id))
    if (toDownload.length === 0) return

    try {
      await downloadAIImagesMutation.mutateAsync(toDownload)
    } catch (_error) {
      // Error already handled in mutation
    }
  }, [selectedMedia, onSelectionChange, downloadAIImagesMutation])

  // Handler para Google Drive inline selector.
  // Same incremental + atomic strategy as AI images.
  const handleGoogleDriveChange = useCallback(async (items: GoogleDriveItem[]) => {
    const desired = new Set(items.map(i => i.id))
    desiredDriveIdsRef.current = desired
    onSelectionChange((prev) => prev.filter(m => m.type !== 'google-drive' || desired.has(m.id)))

    const alreadyHave = new Set(
      selectedMedia.filter(m => m.type === 'google-drive').map(m => m.id),
    )
    const toDownload = items.filter(i => !alreadyHave.has(i.id))
    if (toDownload.length === 0) return

    try {
      await downloadDriveMutation.mutateAsync(toDownload.map(i => i.id))
    } catch (_error) {
      // Error already handled in mutation
    }
  }, [selectedMedia, onSelectionChange, downloadDriveMutation])

  // Handler para upload local. LocalFileUploader sends the complete list of
  // uploads, so we atomically swap the 'upload' slice.
  const handleLocalUpload = useCallback((files: UploadedFile[]) => {
    const newMedia: MediaItem[] = files.map(f => ({
      id: f.id,
      type: 'upload' as const,
      url: f.url,
      pathname: f.pathname,
      name: f.name,
      size: f.size,
    }))

    /*
      O uploader manda a lista COMPLETA do que ele gerencia, então a fatia de
      upload é trocada de uma vez. Mas o que já ESTAVA no post também chega
      como 'upload' (não se sabe de onde veio), e sem a ressalva do
      `preexistente` subir uma foto nova no editar APAGAVA os slides
      existentes — num carrossel de 7, adicionar 1 imagem deixava 1. O
      uploader não gerencia essas mídias; quem as remove é o botão do card.
    */
    onSelectionChange((prev) => [
      ...prev.filter((m) => m.type !== 'upload' || m.preexistente),
      ...newMedia,
    ])
  }, [onSelectionChange])

  /**
   * Enquadramento de mídia que veio por URL (Criativos, IA, Drive).
   *
   * O upload local já é recortado no navegador antes de subir; aqui a origem é
   * uma URL, então quem recorta é o servidor (`/api/posts/media/crop`) e a
   * mídia do post passa a apontar para o arquivo novo. A arte de origem fica
   * intacta — o mesmo criativo pode ir para dois posts com enquadramentos
   * diferentes.
   */
  const [filaCrop, setFilaCrop] = useState<PendenteDeCrop[]>([])
  const [cropEnviando, setCropEnviando] = useState(false)
  // Ids já medidos — sem isso o efeito reabriria a fila a cada render
  const medidosRef = useRef<Set<string>>(new Set())

  // REEL é só vídeo — não há enquadramento de imagem ali
  const cropPostType: CropPostType | null = postType === 'REEL' ? null : postType

  /**
   * Toda imagem fora da proporção do formato entra na fila de enquadramento
   * assim que é escolhida.
   *
   * Antes, quem cortava as fotos do Drive e da IA era a própria rota de
   * download, no ato da seleção: a foto chegava cortada no centro e o que ficou
   * de fora sumia. Hoje ela sobe inteira e a escolha acontece aqui, no momento
   * de montar o post — que é onde se sabe o formato.
   */
  useEffect(() => {
    if (!cropPostType) return
    const pendentes = selectedMedia.filter(
      (m) => !m.cropped && !medidosRef.current.has(m.id) && !ehVideo(m),
    )
    if (pendentes.length === 0) return

    let cancelado = false
    void (async () => {
      const novos: PendenteDeCrop[] = []
      for (const item of pendentes) {
        medidosRef.current.add(item.id)
        try {
          const naturalSize = await readImageSizeFromUrl(item.url)
          if (!matchesPostRatio(naturalSize, cropPostType)) {
            novos.push({ id: item.id, url: item.url, naturalSize })
          }
        } catch {
          // Imagem que não carrega não entra na fila; o envio ao publicador
          // ainda normaliza o que sobrar
        }
      }
      if (!cancelado && novos.length > 0) setFilaCrop((fila) => [...fila, ...novos])
    })()

    return () => {
      cancelado = true
    }
  }, [selectedMedia, cropPostType])

  // Trocar de formato muda o que é "fora da proporção": tudo é remedido
  useEffect(() => {
    medidosRef.current = new Set()
    setFilaCrop([])
  }, [cropPostType])

  const aplicarCrop = useCallback(async (item: PendenteDeCrop, crop: CropRegion) => {
    if (!cropPostType) return
    const resposta = await api.post<{ url: string; pathname: string }>(
      '/api/posts/media/crop',
      { sourceUrl: item.url, postType: cropPostType, crop },
    )
    onSelectionChange((prev) =>
      prev.map((m) =>
        m.id === item.id
          ? {
              ...m,
              url: resposta.url,
              thumbnailUrl: resposta.url,
              pathname: resposta.pathname,
              cropped: true,
            }
          : m,
      ),
    )
  }, [cropPostType, onSelectionChange])

  /** Botão "Enquadrar" do card — reabre a escolha de uma mídia específica */
  const handleAbrirEnquadramento = useCallback(async (id: string) => {
    const item = selectedMedia.find((m) => m.id === id)
    if (!item) return
    try {
      const naturalSize = await readImageSizeFromUrl(item.url)
      setFilaCrop((fila) =>
        fila.some((f) => f.id === id) ? fila : [{ id, url: item.url, naturalSize }, ...fila],
      )
    } catch {
      toast.error('Não foi possível abrir esta imagem para enquadrar')
    }
  }, [selectedMedia])

  const handleCropConfirm = useCallback(async (crop: CropRegion) => {
    const atual = filaCrop[0]
    if (!atual) return
    setCropEnviando(true)
    try {
      await aplicarCrop(atual, crop)
      setFilaCrop((fila) => fila.slice(1))
      toast.success('Enquadramento aplicado')
    } catch (error) {
      console.error('[crop] falha ao enquadrar mídia', error)
      toast.error('Não foi possível enquadrar a imagem')
    } finally {
      setCropEnviando(false)
    }
  }, [filaCrop, aplicarCrop])

  /** "Usar o centro" — o padrão de quem não quer escolher, para a fila inteira */
  const handleCropCentroEmTodas = useCallback(async () => {
    if (!cropPostType) return
    const pendentes = filaCrop
    setCropEnviando(true)
    try {
      for (const item of pendentes) {
        await aplicarCrop(item, centeredCrop(item.naturalSize, cropPostType))
      }
      setFilaCrop([])
      toast.success(
        pendentes.length > 1 ? `${pendentes.length} imagens enquadradas no centro` : 'Enquadrada no centro',
      )
    } catch (error) {
      console.error('[crop] falha ao enquadrar no centro', error)
      toast.error('Não foi possível enquadrar as imagens')
    } finally {
      setCropEnviando(false)
    }
  }, [filaCrop, cropPostType, aplicarCrop])

  /** Deixar a foto como está: o publicador normaliza para 4:5 no envio */
  const handleCropDispensar = useCallback(() => {
    setFilaCrop((fila) => fila.slice(1))
  }, [])

  // Handler para remover item — remove ONLY the requested item, by id (never by
  // array index, which can drift when downloads resolve concurrently).
  const handleRemoveItem = useCallback((id: string) => {
    onSelectionChange((prev) => prev.filter(m => m.id !== id))
  }, [onSelectionChange])

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px de movimento antes de começar o drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handler para reordenação via drag & drop
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = selectedMedia.findIndex((item) => item.id === active.id)
      const newIndex = selectedMedia.findIndex((item) => item.id === over.id)

      const reorderedMedia = arrayMove(selectedMedia, oldIndex, newIndex)
      onSelectionChange(reorderedMedia)
      toast.success('Ordem atualizada')
    }
  }

  // Memoize selectedIds to prevent unnecessary re-renders
  const selectedGenerationIds = useMemo(() =>
    selectedMedia
      .filter(m => m.type === 'generation')
      .map(m => m.id),
    [selectedMedia]
  )

  const generationsMaxSelection = useMemo(() =>
    remainingSlots + selectedMedia.filter(m => m.type === 'generation').length,
    [remainingSlots, selectedMedia]
  )

  const selectedAIImageIds = useMemo(() =>
    selectedMedia
      .filter(m => m.type === 'ai-image')
      .map(m => m.id),
    [selectedMedia]
  )

  const aiImagesMaxSelection = useMemo(() =>
    remainingSlots + selectedMedia.filter(m => m.type === 'ai-image').length,
    [remainingSlots, selectedMedia]
  )

  return (
    <div className="space-y-4">
      {/* Header com contador */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Selecionar Mídia</h3>
          <p className="text-sm text-muted-foreground">
            {maxSelection === 1
              ? 'Selecione 1 arquivo'
              : `Selecione até ${maxSelection} arquivos`}
          </p>
        </div>

        <Badge variant="secondary" className="text-base px-3 py-1 font-mono">
          {selectedMedia.length}/{maxSelection}
        </Badge>
      </div>

      {/* Tabs de Fonte */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
          <TabsTrigger value="generations" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Criativos</span>
          </TabsTrigger>

          <TabsTrigger value="ai-images" className="gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Img. IA</span>
          </TabsTrigger>

          <TabsTrigger value="google-drive" className="gap-2">
            <FolderIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Drive</span>
          </TabsTrigger>

          <TabsTrigger value="upload" className="gap-2">
            <UploadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Upload</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab: Criativos (Generations) */}
        <TabsContent value="generations" className="mt-4">
          <GenerationsSelector
            projectId={projectId}
            selectedIds={selectedGenerationIds}
            onSelectionChange={handleGenerationsChange}
            maxSelection={generationsMaxSelection}
          />
        </TabsContent>

        {/* Tab: AI Images */}
        <TabsContent value="ai-images" className="mt-4">
          <AIImagesSelector
            projectId={projectId}
            selectedIds={selectedAIImageIds}
            onSelectionChange={handleAIImagesChange}
            maxSelection={aiImagesMaxSelection}
          />
        </TabsContent>

        {/* Tab: Google Drive */}
        <TabsContent value="google-drive" className="mt-4">
          <GoogleDriveInlineSelector
            mode={mediaMode}
            initialFolderId={initialFolderId}
            initialFolderName={initialFolderName}
            selectedIds={selectedGoogleDriveIds}
            onSelectionChange={handleGoogleDriveChange}
            maxSelection={googleDriveMaxSelection}
          />
        </TabsContent>

        {/* Tab: Upload Direto */}
        <TabsContent value="upload" className="mt-4">
          <LocalFileUploader
            onUploadComplete={handleLocalUpload}
            maxFiles={uploadMaxSelection}
            mediaMode={mediaMode}
            // Formato de destino do enquadramento. REEL é só vídeo — imagem ali
            // não existe, e passar o tipo não muda nada.
            postType={postType === 'REEL' ? undefined : postType}
          />
        </TabsContent>
      </Tabs>

      {/* Preview dos Selecionados com Drag & Drop */}
      {selectedMedia.length > 0 && (
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium text-sm">Arquivos Selecionados</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Arraste para reordenar
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelectionChange([])}
            >
              Limpar Tudo
            </Button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={selectedMedia.map(item => item.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {selectedMedia.map((item, index) => (
                  <SortableMediaItem
                    key={item.id}
                    item={item}
                    index={index}
                    onRemove={handleRemoveItem}
                    onCrop={
                      // Arquivo recém-subido já foi enquadrado no uploader; o
                      // que estava no post, não — daí o `preexistente`.
                      cropPostType && (item.type !== 'upload' || item.preexistente)
                        ? handleAbrirEnquadramento
                        : undefined
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </Card>
      )}

      {/* Loading state */}
      {downloadDriveMutation.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processando arquivos do Google Drive...</span>
        </div>
      )}

      {/* Enquadramento de mídia vinda por URL */}
      {filaCrop[0] && cropPostType && (
        <CropDialog
          open
          src={filaCrop[0].url}
          naturalSize={filaCrop[0].naturalSize}
          postType={cropPostType}
          busy={cropEnviando}
          stepLabel={filaCrop.length > 1 ? `Imagem 1 de ${filaCrop.length}` : undefined}
          onSkipRemaining={handleCropCentroEmTodas}
          skipLabel={filaCrop.length > 1 ? 'Usar o centro em todas' : 'Usar o centro'}
          cancelLabel="Deixar como está"
          onCancel={handleCropDispensar}
          onConfirm={handleCropConfirm}
        />
      )}

      {downloadAIImagesMutation.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Redimensionando imagens de IA...</span>
        </div>
      )}
    </div>
  )
}
