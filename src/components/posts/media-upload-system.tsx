'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
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
    const newMedia: MediaItem[] = generations.map(g => ({
      id: g.id,
      type: 'generation' as const,
      url: g.resultUrl,
      thumbnailUrl: g.thumbnailUrl || g.resultUrl,
      name: g.templateName,
    }))

    onSelectionChange((prev) => [...prev.filter(m => m.type !== 'generation'), ...newMedia])
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

    onSelectionChange((prev) => [...prev.filter(m => m.type !== 'upload'), ...newMedia])
  }, [onSelectionChange])

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
        <TabsList className="grid grid-cols-4 w-full">
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

      {downloadAIImagesMutation.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Redimensionando imagens de IA...</span>
        </div>
      )}
    </div>
  )
}
