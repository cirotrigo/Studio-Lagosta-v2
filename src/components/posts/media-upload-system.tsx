'use client'

import { useState, useCallback, useRef, useEffect, useMemo, startTransition } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, FolderIcon, UploadIcon, X, Loader2 } from 'lucide-react'
import { GenerationsSelector } from './generations-selector'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'
import type { GoogleDriveItem } from '@/types/google-drive'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface MediaItem {
  id: string
  type: 'generation' | 'google-drive' | 'upload'
  url: string
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
}

interface Generation {
  id: string
  templateName: string
  resultUrl: string
  createdAt: string
}

export function MediaUploadSystem({
  projectId,
  selectedMedia,
  onSelectionChange,
  maxSelection
}: MediaUploadSystemProps) {
  const [activeTab, setActiveTab] = useState('generations')
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false)
  const [selectedGoogleDriveFiles, setSelectedGoogleDriveFiles] = useState<GoogleDriveItem[]>([])

  // Use refs to avoid recreating callbacks
  const selectedMediaRef = useRef(selectedMedia)
  const onSelectionChangeRef = useRef(onSelectionChange)

  // Keep refs in sync
  useEffect(() => {
    selectedMediaRef.current = selectedMedia
    onSelectionChangeRef.current = onSelectionChange
  }, [selectedMedia, onSelectionChange])

  // Mutation para download e upload de arquivos do Google Drive
  const downloadDriveMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      // Simulação - em produção, implementar endpoint real
      // POST /api/projects/{projectId}/google-drive/download
      return api.post(`/api/projects/${projectId}/google-drive/download`, { fileIds })
    },
    onSuccess: (data: any) => {
      // Adicionar arquivos baixados à seleção
      const newMedia: MediaItem[] = data.files.map((file: any) => ({
        id: file.id,
        type: 'google-drive' as const,
        url: file.url,
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
    } catch (error) {
      // Error already handled in mutation
    }
  }

  // Handler para remover item
  const handleRemoveItem = (index: number) => {
    const newMedia = selectedMedia.filter((_, i) => i !== index)
    onSelectionChange(newMedia)
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

          <TabsTrigger value="upload" className="gap-2" disabled>
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
          <Card className="p-8 text-center border-dashed">
            <UploadIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">Upload Direto</h3>
            <p className="text-sm text-muted-foreground">
              Funcionalidade em desenvolvimento
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview dos Selecionados */}
      {selectedMedia.length > 0 && (
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Arquivos Selecionados</h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelectionChange([])}
            >
              Limpar Tudo
            </Button>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {selectedMedia.map((item, index) => (
              <div key={`${item.type}-${item.id}-${index}`} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden border-2 border-primary bg-muted">
                  <img
                    src={item.thumbnailUrl || item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <div className="w-8 h-8 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                      <X className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Order badge */}
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
                    {index + 1}
                  </div>

                  {/* Type badge */}
                  <div className="absolute bottom-1 left-1">
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      {item.type === 'generation' ? 'Criativo' :
                       item.type === 'google-drive' ? 'Drive' : 'Upload'}
                    </Badge>
                  </div>
                </div>

                <p className="text-[10px] text-center mt-1 text-muted-foreground truncate" title={item.name}>
                  {item.name}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Google Drive Modal */}
      <DesktopGoogleDriveModal
        open={isGoogleDriveModalOpen}
        onOpenChange={setIsGoogleDriveModalOpen}
        mode="images"
        multiSelect={true}
        maxSelection={remainingSlots}
        selectedItems={selectedGoogleDriveFiles}
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
