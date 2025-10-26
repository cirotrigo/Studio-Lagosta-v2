'use client'

import { useState, useCallback, useRef, useEffect, useMemo, startTransition } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, FolderIcon, UploadIcon, X, Loader2 } from 'lucide-react'
import { GenerationsSelector } from './generations-selector'
import { LocalFileUploader } from './local-file-uploader'
import { SortableMediaItem } from './sortable-media-item'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'
import type { GoogleDriveItem } from '@/types/google-drive'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import Image from 'next/image'
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
  type: 'generation' | 'google-drive' | 'upload'
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
  onSelectionChange: (media: MediaItem[]) => void
  maxSelection: number
  postType?: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL'
}

interface Generation {
  id: string
  templateName: string
  resultUrl: string
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

interface GoogleDriveDownloadResponse {
  files: DownloadedDriveFile[]
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
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false)
  const [_selectedGoogleDriveFiles, _setSelectedGoogleDriveFiles] = useState<GoogleDriveItem[]>([])

  // Determine media mode based on post type
  const mediaMode = useMemo(() => {
    if (postType === 'REEL') return 'videos' // Only videos for reels
    if (postType === 'STORY') return 'both' // Images and videos for stories
    return 'images' // Images only for POST and CAROUSEL
  }, [postType])

  // Use refs to avoid recreating callbacks
  const selectedMediaRef = useRef(selectedMedia)
  const onSelectionChangeRef = useRef(onSelectionChange)

  // Keep refs in sync
  useEffect(() => {
    selectedMediaRef.current = selectedMedia
    onSelectionChangeRef.current = onSelectionChange
  }, [selectedMedia, onSelectionChange])

  // Mutation para download e upload de arquivos do Google Drive
  const downloadDriveMutation = useMutation<GoogleDriveDownloadResponse, Error, string[]>({
    mutationFn: async (fileIds) => {
      return api.post(`/api/google-drive-download`, { projectId, fileIds }) as Promise<GoogleDriveDownloadResponse>
    },
    onSuccess: (data) => {
      // Adicionar arquivos baixados à seleção
      const newMedia: MediaItem[] = data.files.map((file) => ({
        id: file.id,
        type: 'google-drive' as const,
        url: file.url,
        pathname: file.pathname,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      }))
      onSelectionChange([...selectedMedia, ...newMedia])
      toast.success(`${data.uploaded} arquivo(s) preparado(s)`)
      setIsGoogleDriveModalOpen(false)
    },
    onError: (error) => {
      console.error('Error downloading from Google Drive:', error)
      toast.error('Erro ao processar arquivos do Google Drive')
    },
  })

  // Handler para seleção de Generations
  const handleGenerationsChange = useCallback((ids: string[], generations: Generation[]) => {
    startTransition(() => {
      const newMedia: MediaItem[] = generations.map(g => ({
        id: g.id,
        type: 'generation' as const,
        url: g.resultUrl,
        thumbnailUrl: g.resultUrl,
        name: g.templateName,
      }))

      // Remove existing generation items and add new ones
      const otherMedia = selectedMediaRef.current.filter(m => m.type !== 'generation')
      onSelectionChangeRef.current([...otherMedia, ...newMedia])
    })
  }, [])

  // Handler para Google Drive
  const handleGoogleDriveConfirm = async (items: GoogleDriveItem[]) => {
    if (items.length === 0) return

    try {
      await downloadDriveMutation.mutateAsync(items.map(item => item.id))
    } catch (_error) {
      // Error already handled in mutation
    }
  }

  // Handler para upload local
  const handleLocalUpload = useCallback((files: UploadedFile[]) => {
    const newMedia: MediaItem[] = files.map(f => ({
      id: f.id,
      type: 'upload' as const,
      url: f.url,
      pathname: f.pathname,
      name: f.name,
      size: f.size,
    }))

    const otherMedia = selectedMedia.filter(m => m.type !== 'upload')
    onSelectionChange([...otherMedia, ...newMedia])
  }, [selectedMedia, onSelectionChange])

  // Handler para remover item
  const handleRemoveItem = (index: number) => {
    const newMedia = selectedMedia.filter((_, i) => i !== index)
    onSelectionChange(newMedia)
  }

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

  const remainingSlots = maxSelection - selectedMedia.length

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
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="generations" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Criativos</span>
          </TabsTrigger>

          <TabsTrigger value="google-drive" className="gap-2">
            <FolderIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Google Drive</span>
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

        {/* Tab: Google Drive */}
        <TabsContent value="google-drive" className="mt-4">
          <Card className="p-8 text-center border-dashed">
            <FolderIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">Selecionar do Google Drive</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Escolha imagens ou vídeos da pasta configurada no Google Drive
            </p>
            <Button
              onClick={() => setIsGoogleDriveModalOpen(true)}
              disabled={remainingSlots === 0}
            >
              <FolderIcon className="w-4 h-4 mr-2" />
              Abrir Google Drive
            </Button>
            {remainingSlots === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-3">
                Limite atingido. Remova alguns arquivos para adicionar mais.
              </p>
            )}
          </Card>
        </TabsContent>

        {/* Tab: Upload Direto */}
        <TabsContent value="upload" className="mt-4">
          <LocalFileUploader
            onUploadComplete={handleLocalUpload}
            maxFiles={remainingSlots}
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
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
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

      {/* Google Drive Modal */}
      <DesktopGoogleDriveModal
        open={isGoogleDriveModalOpen}
        onOpenChange={setIsGoogleDriveModalOpen}
        mode={mediaMode}
        multiSelect={true}
        maxSelection={remainingSlots}
        selectedItems={_selectedGoogleDriveFiles}
        onSelect={() => {}} // Not used in multi-select mode
        onMultiSelectConfirm={handleGoogleDriveConfirm}
      />

      {/* Loading state */}
      {downloadDriveMutation.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processando arquivos do Google Drive...</span>
        </div>
      )}
    </div>
  )
}
