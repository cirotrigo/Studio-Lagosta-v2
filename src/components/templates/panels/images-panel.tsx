"use client"

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, HardDrive, Loader2, FolderOpen, Image as ImageIcon, ChevronRight, ArrowLeft, Folder } from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { useProject } from '@/hooks/use-project'
import type { GoogleDriveItem } from '@/types/google-drive'

interface BreadcrumbItem {
  id: string
  name: string
}

export function ImagesPanelContent() {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()
  const { data: project } = useProject(projectId)

  const [isDragging, setIsDragging] = React.useState(false)
  const [driveItems, setDriveItems] = React.useState<GoogleDriveItem[]>([])
  const [isLoadingDrive, setIsLoadingDrive] = React.useState(false)
  const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isApplyingMedia, setIsApplyingMedia] = React.useState(false)
  const [nextPageToken, setNextPageToken] = React.useState<string | undefined>(undefined)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  const { upload: uploadToBlob, isUploading } = useBlobUpload()

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const driveFolderId =
    project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId ?? null
  const driveFolderName =
    project?.googleDriveImagesFolderName ?? project?.googleDriveFolderName ?? null

  // Insert image layer with exact canvas size
  const insertImageLayer = React.useCallback(
    (url: string, name?: string) => {
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

      addLayer(layer)
      toast({
        title: 'Imagem adicionada',
        description: 'A imagem foi ajustada ao tamanho do canvas.'
      })
    },
    [addLayer, canvasWidth, canvasHeight, toast],
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

    console.log('[ImagesPanel] Loading Drive files from folder:', folderId, folderName, 'pageToken:', pageToken)

    try {
      // Build URL with pagination support
      const params = new URLSearchParams({
        folderId,
        mode: 'images',
      })
      if (pageToken) {
        params.append('pageToken', pageToken)
      }

      const url = `/api/google-drive/files?${params.toString()}`
      console.log('[ImagesPanel] Fetching:', url)

      const response = await fetch(url)
      console.log('[ImagesPanel] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[ImagesPanel] API Error:', errorText)
        throw new Error('Falha ao carregar arquivos do Drive')
      }

      const data = await response.json()
      console.log('[ImagesPanel] Received data:', data)

      // The API returns 'items' and 'nextPageToken'
      const items = data.items || []
      const newNextPageToken = data.nextPageToken
      console.log('[ImagesPanel] Items count:', items.length, 'nextPageToken:', newNextPageToken)

      if (items.length > 0 && !isLoadingMore) {
        console.log('[ImagesPanel] First item:', items[0])
      }

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
    console.log('[ImagesPanel] Mount effect - driveFolderId:', driveFolderId, 'driveFolderName:', driveFolderName)
    console.log('[ImagesPanel] Project data:', project)

    if (driveFolderId && driveFolderName) {
      console.log('[ImagesPanel] Initializing with folder:', driveFolderId)
      setBreadcrumbs([{ id: driveFolderId, name: driveFolderName }])
      loadDriveFiles(driveFolderId, driveFolderName)
    } else {
      console.warn('[ImagesPanel] No Drive folder configured for this project')
    }
  }, [driveFolderId, driveFolderName, project, loadDriveFiles])

  // File upload
  const uploadFile = React.useCallback(
    async (file: File) => {
      setIsApplyingMedia(true)
      try {
        // Client-side upload direto ao Vercel Blob
        const url = await uploadToBlob(file)
        insertImageLayer(url, file.name)

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

  // Import from Google Drive
  const importDriveFile = React.useCallback(async (fileId: string, fileName: string) => {
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
      insertImageLayer(uploaded.url, uploaded.name ?? fileName)
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

  // Handle file/folder click
  const handleDriveItemClick = React.useCallback((item: GoogleDriveItem) => {
    if (isApplyingMedia) {
      return
    }
    if (item.kind === 'folder') {
      // Navigate into folder
      navigateToFolder(item.id, item.name)
    } else {
      // Import image
      importDriveFile(item.id, item.name)
    }
  }, [navigateToFolder, importDriveFile, isApplyingMedia])

  const isBusy = isUploading || isApplyingMedia

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <Tabs defaultValue="drive" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="drive" className="text-xs">
            <HardDrive className="mr-1 h-3 w-3" />
            Google Drive
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs">
            <Upload className="mr-1 h-3 w-3" />
            Upload
          </TabsTrigger>
        </TabsList>

        {/* Google Drive Tab - First */}
        <TabsContent value="drive" className="mt-4 space-y-3">
          {/* Navigation Header */}
          <div className="space-y-2">
            {/* Back Button */}
            {breadcrumbs.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateBack}
                className="h-8 w-full justify-start"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            )}

            {/* Breadcrumbs */}
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                  {index > 0 && <ChevronRight className="h-3 w-3" />}
                  <button
                    onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    className={`truncate max-w-[100px] hover:text-foreground ${
                      index === breadcrumbs.length - 1 ? 'font-medium text-foreground' : ''
                    }`}
                    title={crumb.name}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Files/Folders Grid */}
          {!driveFolderId ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-12">
              <HardDrive className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                Google Drive não configurado
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure uma pasta do Google Drive nas configurações do projeto
              </p>
            </div>
          ) : isLoadingDrive ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : driveItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-12">
              <FolderOpen className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                Pasta vazia
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum arquivo ou pasta encontrado
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[450px]">
              <div className="grid grid-cols-2 gap-3">
                {driveItems.map((item) => {
                  const isFolder = item.kind === 'folder'
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleDriveItemClick(item)}
                      disabled={isBusy}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/30 transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isFolder ? (
                        <div className="flex h-full w-full flex-col items-center justify-center">
                          <Folder className="h-12 w-12 text-primary/70" />
                          <p className="mt-2 truncate px-2 text-xs font-medium text-foreground">
                            {item.name}
                          </p>
                        </div>
                      ) : item.thumbnailLink ? (
                        <div className="relative h-full w-full">
                          <Image
                            src={item.thumbnailLink}
                            alt={item.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                      {!isFolder && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                          <p className="truncate text-xs font-medium text-white">
                            {item.name}
                          </p>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Load More Button */}
              {nextPageToken && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={loadMoreItems}
                    disabled={isLoadingMore || isApplyingMedia}
                    className="w-full"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      `Carregar mais (${driveItems.filter(item => item.kind !== 'folder').length} fotos carregadas)`
                    )}
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </TabsContent>

        {/* Upload Tab - Second with Drag & Drop */}
        <TabsContent value="upload" className="mt-4 space-y-4">
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-border/60 hover:border-primary/50 hover:bg-muted/50'
            }`}
            onClick={() => {
              if (!isBusy) {
                fileInputRef.current?.click()
              }
            }}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Enviando imagem...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Upload className="mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="mb-1 text-sm font-medium text-foreground">
                  {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem ou clique para selecionar'}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, GIF até 10MB
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">
              <strong>Dica:</strong> A imagem será ajustada automaticamente para preencher todo o canvas.
              Você pode redimensioná-la depois usando as ferramentas de transformação.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      {isBusy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aplicando imagem...
          </div>
        </div>
      )}
    </div>
  )
}
