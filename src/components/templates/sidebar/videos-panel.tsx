"use client"

import * as React from 'react'
import Image from 'next/image'
import { HardDrive, Upload, Loader2, FolderOpen, ChevronRight, ArrowLeft, Folder, Film } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useProject } from '@/hooks/use-project'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import type { GoogleDriveItem } from '@/types/google-drive'
import { caixaDoMotion, pareceMotion } from '@/lib/video/camadas-de-video'

/** Largura e altura do vídeo, pelos metadados. `null` se não der para ler em 8 s. */
function medirVideo(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const fim = (r: { width: number; height: number } | null) => {
      clearTimeout(prazo)
      video.removeAttribute('src')
      video.load()
      resolve(r)
    }
    const prazo = setTimeout(() => fim(null), 8000)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => fim(video.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : null)
    video.onerror = () => fim(null)
    video.src = url
  })
}

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
  const initializedFolderKeyRef = React.useRef<string | null>(null)

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
    async (url: string, name?: string) => {
      const base = createDefaultLayer('video')
      // WebM com fundo transparente entra como MOTION: por cima da página,
      // tocando uma vez (ver src/lib/video/camadas-de-video.ts)
      const motion = pareceMotion(url) || pareceMotion(name)
      // Motion fora da proporção da página (a logo animada 1:1) entra solto,
      // na própria proporção; o vídeo comum sempre cobre a página.
      const caixa = caixaDoMotion(motion ? await medirVideo(url) : null, { width: canvasWidth, height: canvasHeight })
      addLayer({
        ...base,
        name: `${motion ? 'Motion' : 'Vídeo'}${name ? ` - ${name}` : ''}`,
        fileUrl: url,
        ...caixa,
        videoMetadata: {
          ...base.videoMetadata,
          autoplay: true,
          loop: !motion,
          muted: true,
          objectFit: 'cover',
          ...(motion ? { overlay: true } : {}),
        },
      })

      toast(
        motion
          ? {
              title: 'Motion adicionado',
              description:
                'Entrou por cima da página e toca uma vez no vídeo final. Se for um vídeo comum, desligue "Motion" no painel do vídeo.',
            }
          : {
              title: 'Vídeo adicionado',
              description: 'O vídeo foi ajustado para preencher o canvas.',
            },
      )
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
      const folderKey = `${driveFolderId}:${initialName}`
      if (initializedFolderKeyRef.current === folderKey) {
        return
      }

      initializedFolderKeyRef.current = folderKey
      setBreadcrumbs([{ id: driveFolderId, name: initialName }])
      void loadDriveFiles(driveFolderId, initialName)
    } else {
      initializedFolderKeyRef.current = null
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
        await insertVideoLayer(uploaded.url, uploaded.name ?? item.name)
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
        await insertVideoLayer(videoUrl, baseName)

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

  const driveFolders = driveItems.filter((item) => item.kind === 'folder')
  const driveFiles = driveItems.filter((item) => item.kind !== 'folder')

  /**
   * Breadcrumbs compactados, como na aba Imagens: a partir de 4 níveis mostramos
   * raiz … últimos dois. Os intermediários seguem alcançáveis pelo voltar.
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
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleFileChange}
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

        <TabsContent value="drive" className="mt-2 space-y-2">
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-2">
              {breadcrumbs.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={navigateBack}
                  disabled={isBusy}
                  className="h-7 w-7 p-0 flex-shrink-0"
                  title="Voltar"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
              )}

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

          {!driveFolderId ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
              <HardDrive className="mb-2 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">Google Drive não configurado</p>
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
              <p className="text-sm font-medium text-muted-foreground">Pasta vazia</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Nenhum vídeo encontrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Pastas em LISTA, como na aba Imagens: o nome ("Motions") fica
                  sempre visível, em qualquer largura de painel. */}
              {driveFolders.length > 0 && (
                <div className="space-y-1">
                  {driveFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => handleDriveItemClick(folder)}
                      disabled={isBusy}
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
                  Vídeos ({driveFiles.length}{nextPageToken ? '+' : ''})
                </p>
              )}

              {driveFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {driveFiles.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleDriveItemClick(item)}
                      disabled={isBusy}
                      title={item.name}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-card/50 transition-all hover:border-primary/50 hover:bg-muted/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
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
                          <Film className="h-8 w-8 text-muted-foreground/30" />
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

              {nextPageToken && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMoreItems}
                    disabled={isLoadingMore || isApplying}
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
        </TabsContent>

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
              if (!isBusy) {
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
                <p className="text-sm font-medium text-foreground">Enviando vídeo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="mb-4 rounded-full bg-muted/50 p-3 ring-1 ring-border/50 transition-all group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-primary">
                  <Upload className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  {isDragging ? 'Solte o vídeo aqui' : 'Clique ou arraste vídeos'}
                </p>
                <p className="text-xs text-muted-foreground/70">MP4, WebM ou MOV até 100MB</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {isBusy && (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-background/80 backdrop-blur-sm">
          {/* O conteúdo rola no host (sem ScrollArea de altura fixa), então o
              overlay pode ficar mais alto que a janela — o sticky mantém o
              aviso à vista, como na aba Imagens. */}
          <div className="sticky top-[35vh] flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aplicando vídeo...
          </div>
        </div>
      )}
    </div>
  )
}
