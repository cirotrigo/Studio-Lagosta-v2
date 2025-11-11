"use client"

import * as React from 'react'
import Image from 'next/image'
import { HardDrive, Upload, Loader2, FolderOpen, ChevronRight, ArrowLeft, Folder, Film } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useProject } from '@/hooks/use-project'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import type { GoogleDriveItem } from '@/types/google-drive'

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

interface BreadcrumbItem {
  id: string
  name: string
}

export function VideosPanel() {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()
  const { data: project } = useProject(projectId)

  const [driveItems, setDriveItems] = React.useState<GoogleDriveItem[]>([])
  const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
  const [isLoadingDrive, setIsLoadingDrive] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isApplying, setIsApplying] = React.useState(false)
  const [nextPageToken, setNextPageToken] = React.useState<string | undefined>(undefined)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const { upload: uploadToBlob, isUploading, progress } = useBlobUpload()

  const driveFolderId =
    project?.googleDriveVideosFolderId ??
    project?.googleDriveFolderId ??
    null
  const driveFolderName =
    project?.googleDriveVideosFolderName ??
    project?.googleDriveFolderName ??
    null

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const insertVideoLayer = React.useCallback(
    (url: string, name?: string) => {
      const base = createDefaultLayer('video')
      addLayer({
        ...base,
        name: name ? `Vídeo - ${name}` : 'Vídeo',
        fileUrl: url,
        size: { width: canvasWidth, height: canvasHeight },
        position: { x: 0, y: 0 },
        videoMetadata: {
          ...base.videoMetadata,
          autoplay: true,
          loop: true,
          muted: true,
          objectFit: 'cover',
        },
      })

      toast({
        title: 'Vídeo adicionado',
        description: 'O vídeo foi ajustado para preencher o canvas.',
      })
    },
    [addLayer, canvasHeight, canvasWidth, toast],
  )

  const loadDriveFiles = React.useCallback(
    async (folderId: string, folderName?: string, pageToken?: string) => {
      if (!folderId) return

      const isLoadingMore = Boolean(pageToken)

      if (isLoadingMore) {
        setIsLoadingMore(true)
      } else {
        setIsLoadingDrive(true)
        setDriveItems([]) // Clear items on fresh load
        setNextPageToken(undefined)
      }

      console.log('[VideosPanel] Loading Drive files from folder:', folderId, folderName, 'pageToken:', pageToken)

      try {
        // Build URL with pagination support
        const params = new URLSearchParams({
          folderId,
          mode: 'videos',
        })
        if (pageToken) {
          params.append('pageToken', pageToken)
        }

        const url = `/api/google-drive/files?${params.toString()}`
        console.log('[VideosPanel] Fetching:', url)

        const response = await fetch(url)
        console.log('[VideosPanel] Response status:', response.status)

        if (!response.ok) {
          const errorText = await response.text()
          console.error('[VideosPanel] API Error:', errorText)
          throw new Error('Falha ao carregar arquivos do Drive')
        }

        const data = await response.json()
        console.log('[VideosPanel] Received data:', data)

        // The API returns 'items' and 'nextPageToken'
        const items = data.items || []
        const newNextPageToken = data.nextPageToken
        console.log('[VideosPanel] Items count:', items.length, 'nextPageToken:', newNextPageToken)

        if (items.length > 0 && !isLoadingMore) {
          console.log('[VideosPanel] First item:', items[0])
        }

        // Append items if loading more, otherwise replace
        setDriveItems(prev => isLoadingMore ? [...prev, ...items] : items)
        setNextPageToken(newNextPageToken)
      } catch (_error) {
        console.error('[VideosPanel] Failed to load Drive files', _error)
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
    },
    [toast],
  )

  const navigateToFolder = React.useCallback(
    (folderId: string, folderName: string) => {
      setBreadcrumbs((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === folderId)
        if (existingIndex !== -1) {
          return prev.slice(0, existingIndex + 1)
        }
        return [...prev, { id: folderId, name: folderName }]
      })
      void loadDriveFiles(folderId, folderName)
    },
    [loadDriveFiles],
  )

  const navigateBack = React.useCallback(() => {
    let target: BreadcrumbItem | null = null
    setBreadcrumbs((prev) => {
      if (prev.length <= 1) {
        target = null
        return prev
      }
      const next = prev.slice(0, prev.length - 1)
      target = next[next.length - 1] ?? null
      return next
    })
    if (target) {
      void loadDriveFiles(target.id, target.name)
    }
  }, [loadDriveFiles])

  // Load more items (pagination)
  const loadMoreItems = React.useCallback(() => {
    const currentFolder = breadcrumbs[breadcrumbs.length - 1]
    if (currentFolder && nextPageToken) {
      loadDriveFiles(currentFolder.id, currentFolder.name, nextPageToken)
    }
  }, [breadcrumbs, nextPageToken, loadDriveFiles])

  React.useEffect(() => {
    if (driveFolderId) {
      const initialName = driveFolderName ?? 'Pasta do projeto'
      setBreadcrumbs([{ id: driveFolderId, name: initialName }])
      void loadDriveFiles(driveFolderId, initialName)
    } else {
      setBreadcrumbs([])
      setDriveItems([])
    }
  }, [driveFolderId, driveFolderName, loadDriveFiles])

  const importDriveFile = React.useCallback(
    async (item: GoogleDriveItem) => {
      setIsApplying(true)
      try {
        const response = await fetch('/api/upload/google-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: item.id }),
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao importar arquivo do Google Drive')
        }
        const uploaded = (await response.json()) as { url?: string; name?: string }
        if (!uploaded.url) {
          throw new Error('Resposta inválida ao importar vídeo do Google Drive')
        }
        insertVideoLayer(uploaded.url, uploaded.name ?? item.name)
      } catch (_error) {
        console.error('[VideosPanel] Drive import failed', _error)
        toast({
          title: 'Erro ao importar do Drive',
          description: _error instanceof Error ? _error.message : 'Não foi possível copiar o arquivo.',
          variant: 'destructive',
        })
      } finally {
        setIsApplying(false)
      }
    },
    [insertVideoLayer, toast],
  )

  const handleDriveItemClick = React.useCallback(
    (item: GoogleDriveItem) => {
      if (isApplying) {
        return
      }
      if (item.kind === 'folder') {
        navigateToFolder(item.id, item.name)
        return
      }

      if (item.mimeType && !item.mimeType.startsWith('video/')) {
        toast({
          title: 'Arquivo inválido',
          description: 'Selecione um arquivo de vídeo (MP4, WebM ou MOV).',
          variant: 'destructive',
        })
        return
      }

      void importDriveFile(item)
    },
    [importDriveFile, navigateToFolder, toast, isApplying],
  )

  const uploadLocalVideo = React.useCallback(
    async (file: File) => {
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas vídeos MP4, WebM e MOV são suportados.',
          variant: 'destructive',
        })
        return
      }

      if (file.size > MAX_VIDEO_SIZE) {
        toast({
          title: 'Arquivo muito grande',
          description: 'O vídeo deve ter no máximo 100MB.',
          variant: 'destructive',
        })
        return
      }

      setIsApplying(true)
      try {
        // Upload direto ao Vercel Blob (client-side) - sem limite de 4.5MB
        const videoUrl = await uploadToBlob(file)

        const baseName = file.name.replace(/\.[^/.]+$/, '')
        insertVideoLayer(videoUrl, baseName)

        toast({
          title: 'Upload concluído',
          description: 'O vídeo foi enviado com sucesso.',
        })
      } catch (error) {
        console.error('[VideosPanel] Upload failed:', error)
        toast({
          title: 'Erro no upload',
          description: error instanceof Error ? error.message : 'Não foi possível enviar o vídeo.',
          variant: 'destructive',
        })
      } finally {
        setIsApplying(false)
      }
    },
    [insertVideoLayer, toast, uploadToBlob],
  )

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file && !isApplying) {
        await uploadLocalVideo(file)
        event.target.value = ''
      }
    },
    [uploadLocalVideo, isApplying],
  )

  const handleDragEnter = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleDrop = React.useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)

      const files = Array.from(event.dataTransfer.files)
      const videoFile = files.find((file) => file.type.startsWith('video/'))

      if (videoFile && !isApplying) {
        await uploadLocalVideo(videoFile)
      } else {
        toast({
          title: 'Arquivo inválido',
          description: 'Arraste apenas arquivos de vídeo (MP4, WebM ou MOV).',
          variant: 'destructive',
        })
      }
    },
    [uploadLocalVideo, toast, isApplying],
  )

  const isBusy = isUploading || isApplying

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleFileChange}
      />

      <Tabs defaultValue={driveFolderId ? 'drive' : 'upload'} className="w-full">
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

        <TabsContent value="drive" className="mt-4 space-y-3">
          <div className="space-y-2">
            {breadcrumbs.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateBack}
                disabled={isBusy}
                className="h-8 w-full justify-start"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                  {index > 0 && <ChevronRight className="h-3 w-3" />}
                  <button
                    onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    className={`truncate max-w-[120px] hover:text-foreground ${
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

          {!driveFolderId ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-12">
              <HardDrive className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">Pasta de vídeos não configurada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Defina a pasta de vídeos nas configurações do projeto para acessar seus arquivos.
              </p>
            </div>
          ) : isLoadingDrive ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : driveItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-12">
              <FolderOpen className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">Pasta vazia</p>
              <p className="mt-1 text-xs text-muted-foreground">Nenhum vídeo encontrado nesta pasta.</p>
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
                          <Film className="h-10 w-10 text-muted-foreground/60" />
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
                    disabled={isLoadingMore || isApplying}
                    className="w-full"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      `Carregar mais (${driveItems.filter(item => item.kind !== 'folder').length} vídeos carregados)`
                    )}
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </TabsContent>

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
                <p className="text-sm font-medium text-foreground">Processando vídeo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Upload className="mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="mb-1 text-sm font-medium text-foreground">
                  {isDragging ? 'Solte o vídeo aqui' : 'Arraste um vídeo ou clique para selecionar'}
                </p>
                <p className="text-xs text-muted-foreground">MP4, WebM ou MOV até 60MB</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">
              <strong>Dica:</strong> O vídeo será ajustado automaticamente para preencher todo o canvas.
              Garanta que ele esteja em loop ou com duração adequada ao seu criativo.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      {isBusy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aplicando vídeo...
          </div>
        </div>
      )}
    </div>
  )
}
