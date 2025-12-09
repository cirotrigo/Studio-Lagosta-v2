'use client'

import * as React from 'react'
import Image from 'next/image'
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
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

function formatBytes(size?: number) {
  if (!size) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
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
  const [cardAspectRatio, setCardAspectRatio] = React.useState(1)
  const [lightboxDimensions, setLightboxDimensions] = React.useState({ width: 1920, height: 1080 })
  const isVideo = isVideoFile(item)

  // Spotlight effect
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  // Initial aspect ratio setup
  React.useEffect(() => {
    if (isFolder) {
      setCardAspectRatio(1.2)
    } else {
      setCardAspectRatio(0.8) // Default for files
      setLightboxDimensions({
        width: isVideo ? 1920 : 1600,
        height: isVideo ? 1080 : 1600,
      })
    }
  }, [isFolder, isVideo])

  const updateDimensionsFromPreview = React.useCallback(
    (width: number, height: number) => {
      if (!width || !height || isFolder) return
      const ratio = width / height
      setCardAspectRatio(ratio || 1)
      const targetHeight = 2000
      setLightboxDimensions({
        width: Math.max(1, Math.round(ratio * targetHeight)),
        height: targetHeight,
      })
    },
    [isFolder],
  )

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
      if (!isFolder && thumbnailSources.length === 0) {
        setImageState('error')
        setCurrentSrc(null)
      }
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
    setImageState('loaded')
    if (!isVideo) {
      const img = e.currentTarget
      if (img.naturalWidth && img.naturalHeight) {
        updateDimensionsFromPreview(img.naturalWidth, img.naturalHeight)
      }
    }
  }, [isVideo, updateDimensionsFromPreview])

  const fullMediaSrc = `/api/google-drive/image/${item.id}`
  const pswpWidth = Math.max(1, lightboxDimensions.width)
  const pswpHeight = Math.max(1, lightboxDimensions.height)

  return (
    <motion.div
      className={cn(
        "group relative flex flex-col rounded-xl overflow-hidden bg-card border border-white/5 transition-all text-left",
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        'w-full cursor-pointer'
      )}
      onClick={onClick}
      onMouseMove={handleMouseMove}
    >
      {/* Spotlight Effect */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover:opacity-100 z-10"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              color-mix(in oklch, var(--primary) 40%, transparent),
              transparent 80%
            )
          `,
        }}
      />

      <div
        className="relative w-full overflow-hidden bg-muted/40"
        style={{ aspectRatio: cardAspectRatio }}
      >
        {isFolder ? (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground gap-2 p-4 bg-muted/20">
            <button
              className="flex h-full w-full flex-col items-center justify-center focus:outline-none gap-2"
            // onClick is handled by parent div
            >
              <Folder className="h-16 w-16 text-sky-500 fill-sky-500 drop-shadow-md" strokeWidth={1.5} />
              <span className="text-xs text-center line-clamp-2 px-2 opacity-70 break-all text-foreground">
                {item.name}
              </span>
            </button>
          </div>
        ) : (
          <>
            {/* PhotoSwipe link wrapper */}
            <a
              href={fullMediaSrc}
              data-pswp-src={fullMediaSrc}
              data-pswp-width={String(pswpWidth)}
              data-pswp-height={String(pswpHeight)}
              data-pswp-type={isVideo ? 'video' : 'image'}
              data-pswp-media-type={item.mimeType}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full relative"
              onClick={(e) => {
                console.log('🖱️ Google Drive: Link clicked', { isVideo, loaded: imageState === 'loaded' })

                // Allow lightbox only if triggered by script (Eye button)
                // If trusted (user click), prevent lightbox and trigger selection
                if (e.isTrusted) {
                  e.preventDefault()
                  onClick()
                }
              }}
            >
              {/* Loading skeleton */}
              {imageState === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-muted/30">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Preview or fallback */}
              {currentSrc ? (
                <Image
                  src={currentSrc}
                  alt={item.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                  unoptimized
                  className={cn(
                    'object-cover transition duration-500 group-hover:scale-105',
                    imageState === 'loaded' ? 'opacity-100' : 'opacity-0',
                  )}
                  onError={handleImageError}
                  onLoadingComplete={(img) => {
                    setImageState('loaded')
                    if (!isVideo && img.naturalWidth && img.naturalHeight) {
                      updateDimensionsFromPreview(img.naturalWidth, img.naturalHeight)
                    }
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none bg-muted/30">
                  <FileImage className="h-12 w-12 text-muted-foreground opacity-40" />
                  <p className="text-[10px] text-muted-foreground opacity-60 text-center px-4">Preview indisponível</p>
                </div>
              )}

              {/* Video overlay */}
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div className="bg-black/40 backdrop-blur-sm rounded-full p-3 pointer-events-auto hover:bg-black/60 transition-colors">
                    <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                  </div>
                </div>
              )}
            </a>

            {/* Hover overlay with buttons (only for files) */}
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30 pointer-events-auto">
              {/* View in lightbox button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // Trigger PhotoSwipe by dispatching click event on the link
                  const card = e.currentTarget.closest('.group')
                  const link = card?.querySelector('a[data-pswp-src]') as HTMLAnchorElement
                  if (link) {
                    const clickEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window
                    })
                    link.dispatchEvent(clickEvent)
                  }
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-black/40 text-white hover:bg-black/60 shadow-sm backdrop-blur-md transition-all"
                title="Visualizar em tela cheia"
              >
                <Eye className="h-4 w-4" />
              </button>

              {/* Add/Remove Selection Button (alternative to clicking card) */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onClick()
                }}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full shadow-sm backdrop-blur-md transition-all",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-black/40 text-white hover:bg-black/60"
                )}
                title={isSelected ? "Remover da seleção" : "Adicionar à seleção"}
              >
                <Plus className={cn("h-4 w-4 transition-transform", isSelected && "rotate-45")} />
              </button>
            </div>

            {/* Selection indicators for files only */}
            {isSelected && (
              <>
                {/* Selection number */}
                <div className="absolute top-2 left-2 w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold shadow-lg z-30 animate-in fade-in zoom-in">
                  {selectionIndex + 1}
                </div>
              </>
            )}

            {/* Overlay Info - Reveal on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />

            <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-20">
              <h3 className="text-white font-medium text-xs leading-snug line-clamp-2 drop-shadow-sm mb-1 break-anywhere">
                {item.name}
              </h3>
              <div className="flex items-center justify-between text-[10px] text-white/70">
                <span>{formatBytes(item.size)}</span>
                <span>{item.modifiedTime ? format(new Date(item.modifiedTime), 'dd MMM', { locale: ptBR }) : '-'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
