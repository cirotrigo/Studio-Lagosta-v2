'use client'

import * as React from 'react'
import { Folder, HardDrive, Loader2, Search, RefreshCw, X, FolderOpen, AlertCircle, FileImage, Check, ArrowLeft, Eye, Plus, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGoogleDriveItems } from '@/hooks/use-google-drive'
import type { GoogleDriveItem, GoogleDriveBrowserMode } from '@/types/google-drive'
import { cn } from '@/lib/utils'
import { usePhotoSwipe } from '@/hooks/use-photoswipe'

interface FolderBreadcrumb {
  id: string
  name: string
}

interface GoogleDriveInlineSelectorProps {
  mode: GoogleDriveBrowserMode
  initialFolderId?: string | null
  initialFolderName?: string | null
  selectedIds: string[]
  onSelectionChange: (items: GoogleDriveItem[]) => void
  maxSelection: number
}

export function GoogleDriveInlineSelector({
  mode,
  initialFolderId,
  initialFolderName,
  selectedIds,
  onSelectionChange,
  maxSelection,
}: GoogleDriveInlineSelectorProps) {
  const rootLabel = 'Meu Drive'
  const [folderStack, setFolderStack] = React.useState<FolderBreadcrumb[]>(() => {
    if (initialFolderId && initialFolderName) {
      return [
        { id: 'root', name: rootLabel },
        { id: initialFolderId, name: initialFolderName },
      ]
    }
    return [{ id: 'root', name: rootLabel }]
  })
  const [searchTerm, setSearchTerm] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [selectedItems, setSelectedItems] = React.useState<GoogleDriveItem[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
    }, 300)

    return () => clearTimeout(handler)
  }, [searchTerm])

  const currentFolder = folderStack[folderStack.length - 1]
  const currentFolderId = currentFolder?.id === 'root' ? undefined : currentFolder?.id

  const driveQuery = useGoogleDriveItems({
    folderId: currentFolderId,
    mode,
    search: debouncedSearch || undefined,
  })

  const items = React.useMemo(() => {
    if (!driveQuery.data?.pages) return []
    return driveQuery.data.pages.flatMap((page) => page.items)
  }, [driveQuery.data])

  // Initialize PhotoSwipe after items are calculated - must be called before any JSX returns
  usePhotoSwipe({
    gallerySelector: '#google-drive-inline-gallery',
    childSelector: 'a[data-pswp-src]',
    dependencies: [items.length],
    enabled: items.length > 0,
  })

  const queryError = driveQuery.isError
    ? driveQuery.error instanceof Error
      ? driveQuery.error.message
      : 'Erro ao carregar arquivos do Google Drive.'
    : null

  // Navigation handlers
  const handleEnterFolder = React.useCallback((item: GoogleDriveItem) => {
    if (item.kind !== 'folder') return
    setFolderStack((stack) => [...stack, { id: item.id, name: item.name }])
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleBreadcrumbClick = React.useCallback((index: number) => {
    setFolderStack((stack) => stack.slice(0, index + 1))
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleGoBack = React.useCallback(() => {
    if (folderStack.length > 1) {
      setFolderStack((stack) => stack.slice(0, -1))
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [folderStack.length])

  const handleItemToggle = React.useCallback((item: GoogleDriveItem) => {
    if (item.kind === 'folder') {
      handleEnterFolder(item)
      return
    }

    setSelectedItems(prev => {
      const isSelected = prev.some(i => i.id === item.id)

      if (isSelected) {
        // Remove from selection
        const newSelected = prev.filter(i => i.id !== item.id)
        onSelectionChange(newSelected)
        return newSelected
      } else {
        // Add to selection
        if (prev.length >= maxSelection) {
          return prev
        }
        const newSelected = [...prev, item]
        onSelectionChange(newSelected)
        return newSelected
      }
    })
  }, [handleEnterFolder, maxSelection, onSelectionChange])

  const clearSearch = React.useCallback(() => {
    setSearchTerm('')
    setDebouncedSearch('')
  }, [])

  const isLoading = driveQuery.isLoading
  const isFetchingMore = driveQuery.isFetchingNextPage
  const emptyState = !isLoading && items.length === 0

  return (
    <div className="space-y-3">
      {/* Header com busca e navegação */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10 pr-8 h-10"
            />
            {searchTerm && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => driveQuery.refetch()}
            disabled={driveQuery.isFetching}
            aria-label="Atualizar"
            className="h-10 w-10"
          >
            {driveQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2">
          {folderStack.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              className="h-8 px-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto flex-1 pb-1 scrollbar-thin">
            <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
            {folderStack.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                {index > 0 && (
                  <span className="text-muted-foreground shrink-0">/</span>
                )}
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  disabled={index === folderStack.length - 1}
                  className={cn(
                    'whitespace-nowrap rounded px-2 py-1 text-sm font-medium transition',
                    index === folderStack.length - 1
                      ? 'text-foreground bg-muted/40'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                  )}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Counter */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedItems.length === 0
              ? 'Nenhum arquivo selecionado'
              : `${selectedItems.length} ${selectedItems.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}`}
          </p>
          <Badge variant="secondary" className="font-mono">
            {selectedItems.length}/{maxSelection}
          </Badge>
        </div>
      </div>

      {/* Content Area */}
      <ScrollArea className="h-[400px] rounded-lg border p-3" ref={scrollRef}>
        <div>
          {isLoading ? (
            <LoadingGrid />
          ) : queryError ? (
            <ErrorState error={queryError} onRetry={() => driveQuery.refetch()} />
          ) : emptyState ? (
            <EmptyState searchTerm={debouncedSearch} />
          ) : (
            <ItemsGrid
              items={items}
              mode={mode}
              selectedItems={selectedItems}
              onItemToggle={handleItemToggle}
            />
          )}

          {driveQuery.hasNextPage && !isLoading && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => driveQuery.fetchNextPage()}
                disabled={isFetchingMore}
              >
                {isFetchingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {selectedItems.length >= maxSelection && (
        <p className="text-sm text-amber-600 dark:text-amber-500 font-medium text-center">
          Limite de {maxSelection} {maxSelection === 1 ? 'arquivo atingido' : 'arquivos atingido'}
        </p>
      )}
    </div>
  )
}

// Loading Grid Component
function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// Error State Component
function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Erro ao carregar itens</h3>
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
      </div>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" />
        Tentar novamente
      </Button>
    </div>
  )
}

// Empty State Component
function EmptyState({ searchTerm }: { searchTerm: string }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-muted p-4">
        {searchTerm ? (
          <Search className="h-12 w-12 text-muted-foreground" />
        ) : (
          <FolderOpen className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">
          {searchTerm ? 'Nenhum resultado encontrado' : 'Pasta vazia'}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {searchTerm
            ? `Nenhum item corresponde à busca "${searchTerm}"`
            : 'Esta pasta não contém arquivos ou subpastas'}
        </p>
      </div>
    </div>
  )
}

// Items Grid Component
interface ItemsGridProps {
  items: GoogleDriveItem[]
  mode: GoogleDriveBrowserMode
  selectedItems: GoogleDriveItem[]
  onItemToggle: (item: GoogleDriveItem) => void
}

function ItemsGrid({ items, mode, selectedItems, onItemToggle }: ItemsGridProps) {
  return (
    <div id="google-drive-inline-gallery" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((item) => {
        const isFolder = item.kind === 'folder'
        const isSelected = selectedItems.some(i => i.id === item.id)
        const selectionIndex = selectedItems.findIndex(i => i.id === item.id)

        return (
          <ItemCard
            key={item.id}
            item={item}
            isSelected={isSelected}
            selectionIndex={selectionIndex}
            onClick={() => onItemToggle(item)}
            isFolder={isFolder}
          />
        )
      })}
    </div>
  )
}

// Helper function to check if item is a video
function isVideoFile(item: GoogleDriveItem): boolean {
  if (!item.mimeType) return false
  const isVideo = item.mimeType.startsWith('video/')
  if (isVideo) {
    console.log('🎬 Google Drive: Detected video file:', item.name, 'mimeType:', item.mimeType)
  }
  return isVideo
}

// Item Card Component
interface ItemCardProps {
  item: GoogleDriveItem
  isSelected: boolean
  selectionIndex: number
  onClick: () => void
  isFolder: boolean
}

function ItemCard({ item, isSelected, selectionIndex, onClick, isFolder }: ItemCardProps) {
  const [imageState, setImageState] = React.useState<'loading' | 'loaded' | 'error'>('loading')
  const [currentSrc, setCurrentSrc] = React.useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = React.useState({ width: 1920, height: 1080 })
  const isVideo = isVideoFile(item)

  // Log video detection
  React.useEffect(() => {
    if (isVideo) {
      console.log('🎬 Google Drive: Video card rendered:', {
        name: item.name,
        mimeType: item.mimeType,
        id: item.id
      })
    }
  }, [isVideo, item.name, item.mimeType, item.id])

  // Generate thumbnail URLs with fallback chain
  const thumbnailSources = React.useMemo(() => {
    if (isFolder || !item.id) return []

    const sources: string[] = []

    // Para vídeos, use apenas thumbnail gerado pelo Drive (quando disponível)
    if (isVideo) {
      if (item.thumbnailLink) {
        sources.push(item.thumbnailLink.replace(/=s\d+/, '=s400'))
      }
    } else {
      // Imagens podem usar nosso proxy autenticado
      sources.push(`/api/google-drive/thumbnail/${item.id}?size=400`)

      if (item.thumbnailLink) {
        sources.push(item.thumbnailLink.replace(/=s\d+/, '=s400'))
      }

      // Fallback final para imagem completa
      sources.push(`/api/google-drive/image/${item.id}`)
    }

    return sources
  }, [item.id, item.thumbnailLink, isFolder, isVideo])

  React.useEffect(() => {
    if (isFolder || thumbnailSources.length === 0) {
      setImageState('error')
      setCurrentSrc(null)
      return
    }

    setImageState('loading')
    setCurrentSrc(thumbnailSources[0])
  }, [isFolder, thumbnailSources])

  const handleImageError = React.useCallback(() => {
    if (!currentSrc) return

    const currentIndex = thumbnailSources.indexOf(currentSrc)
    const nextIndex = currentIndex + 1

    if (nextIndex < thumbnailSources.length) {
      setCurrentSrc(thumbnailSources[nextIndex])
    } else {
      setImageState('error')
    }
  }, [currentSrc, thumbnailSources])

  const handleImageLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (isVideo) {
      // Para vídeos basta usar dimensões padrão do thumbnail
      setImageState('loaded')
      return
    }

    setImageState('loaded')
    // Para thumbnails, precisamos carregar a imagem completa para obter dimensões reais
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      // Se for thumbnail, carregar imagem completa em background para obter dimensões
      const fullImageUrl = `/api/google-drive/image/${item.id}`
      const fullImg = new Image()
      fullImg.onload = () => {
        setImageDimensions({
          width: fullImg.naturalWidth,
          height: fullImg.naturalHeight
        })
      }
      fullImg.onerror = () => {
        // Fallback to thumbnail dimensions
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight
        })
      }
      fullImg.src = fullImageUrl
    }
  }, [item.id])

  const fullMediaSrc = `/api/google-drive/image/${item.id}`

  return (
    <div
      className="group relative"
      onClick={(e) => {
        console.log('📦 Card wrapper clicked', { isFolder, isVideo, target: e.target })
      }}
    >
      <Card
        className={cn(
          'relative transition-all overflow-hidden border-2',
          isSelected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-transparent hover:border-primary/50',
        )}
      >
        {/* Thumbnail / Icon */}
        <div
          className="relative aspect-square w-full bg-muted"
          onClick={(e) => {
            console.log('🎨 Thumbnail container clicked', { isFolder, isVideo })
          }}
        >
          {isFolder ? (
            <button
              onClick={onClick}
              className="flex h-full w-full items-center justify-center focus:outline-none"
            >
              <Folder className="h-12 w-12 text-muted-foreground opacity-60" />
            </button>
          ) : (
            <>
              {/* PhotoSwipe link wrapper */}
              <a
                href={fullMediaSrc}
                data-pswp-src={fullMediaSrc}
                data-pswp-width={imageDimensions.width.toString()}
                data-pswp-height={imageDimensions.height.toString()}
                data-pswp-type={isVideo ? 'video' : 'image'}
                data-pswp-media-type={item.mimeType}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full relative"
                onClick={() => {
                  console.log('🖱️ Google Drive: Link clicked', {
                    isVideo,
                    loaded: imageState === 'loaded',
                    src: fullMediaSrc
                  })

                  if (isVideo) {
                    console.log('🎬 Google Drive: Video link clicked, letting PhotoSwipe handle it')
                  }
                }}
              >
                {/* Loading skeleton */}
                {imageState === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Preview or fallback */}
                {currentSrc ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentSrc}
                      alt={item.name}
                      className={cn(
                        'w-full h-full object-cover transition-opacity duration-200',
                        imageState === 'loaded' ? 'opacity-100' : 'opacity-0',
                      )}
                      onError={handleImageError}
                      onLoad={handleImageLoad}
                    />
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <FileImage className="h-12 w-12 text-muted-foreground opacity-40" />
                    <p className="text-[10px] text-muted-foreground opacity-60 text-center px-4">Preview indisponível</p>
                  </div>
                )}

                {/* Video overlay */}
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <div className="bg-white/95 rounded-full p-3">
                      <Play className="w-6 h-6 text-black" fill="black" />
                    </div>
                  </div>
                )}
              </a>

              {/* Hover overlay with buttons (only for files) */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2 pointer-events-auto">
                  {/* Add to selection button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onClick()
                    }}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 shadow-lg transition-all hover:scale-110"
                    title={isSelected ? "Remover da seleção" : "Adicionar à seleção"}
                  >
                    <Plus className={cn("h-5 w-5", isSelected && "rotate-45")} />
                  </button>

                  {/* View in lightbox button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      // Trigger PhotoSwipe by dispatching click event on the link
                      const card = e.currentTarget.closest('.group')
                      const link = card?.querySelector('a[data-pswp-src]') as HTMLAnchorElement
                      if (link) {
                        console.log('👁️ Eye button clicked, dispatching click on link:', link.href)
                        // Dispatch a real click event that PhotoSwipe will intercept
                        const clickEvent = new MouseEvent('click', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        })
                        link.dispatchEvent(clickEvent)
                      }
                    }}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-900 shadow-lg transition-all hover:scale-110"
                    title="Visualizar em tela cheia"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Selection indicators for files only */}
              {isSelected && (
                <>
                  {/* Check icon */}
                  <div className="absolute top-2 right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg z-10">
                    <Check className="w-5 h-5" />
                  </div>

                  {/* Selection number */}
                  <div className="absolute top-2 left-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold shadow-lg z-10">
                    {selectionIndex + 1}
                  </div>

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
                </>
              )}
            </>
          )}
        </div>

        {/* File name */}
        <div className="p-2 bg-gradient-to-t from-black/60 to-transparent absolute bottom-0 left-0 right-0 pointer-events-none">
          <p className="text-xs font-medium text-white line-clamp-2 leading-tight">
            {item.name}
          </p>
        </div>
      </Card>
    </div>
  )
}
