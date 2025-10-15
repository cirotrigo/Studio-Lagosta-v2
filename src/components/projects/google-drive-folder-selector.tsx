'use client'

import * as React from 'react'
import Image from 'next/image'
import { Folder, HardDrive, Loader2, Search, RefreshCw, X, FolderOpen, AlertCircle, FileImage } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGoogleDriveItems } from '@/hooks/use-google-drive'
import type { GoogleDriveItem, GoogleDriveBrowserMode } from '@/types/google-drive'
import { cn } from '@/lib/utils'
import { useUpdateProjectSettings, type UpdateProjectSettingsInput } from '@/hooks/use-project'
import { useToast } from '@/hooks/use-toast'

interface FolderBreadcrumb {
  id: string
  name: string
}

interface DesktopGoogleDriveModalProps {
  open: boolean
  mode: GoogleDriveBrowserMode
  initialFolderId?: string | null
  initialFolderName?: string | null
  onOpenChange: (open: boolean) => void
  onSelect: (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => void
  multiSelect?: boolean
  maxSelection?: number
  selectedItems?: GoogleDriveItem[]
  onMultiSelectConfirm?: (items: GoogleDriveItem[]) => void
}

export function DesktopGoogleDriveModal({
  open,
  mode,
  initialFolderId,
  initialFolderName,
  onOpenChange,
  onSelect,
  multiSelect = false,
  maxSelection = 3,
  selectedItems = [],
  onMultiSelectConfirm,
}: DesktopGoogleDriveModalProps) {
  const rootLabel = 'Meu Drive'
  const [folderStack, setFolderStack] = React.useState<FolderBreadcrumb[]>([
    { id: 'root', name: rootLabel },
  ])
  const [searchTerm, setSearchTerm] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [selected, setSelected] = React.useState<GoogleDriveItem | null>(null)
  const [multiSelected, setMultiSelected] = React.useState<GoogleDriveItem[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setDebouncedSearch('')
      setSelected(null)
      setMultiSelected([])
      setFolderStack([{ id: 'root', name: rootLabel }])
      return
    }

    if (initialFolderId && initialFolderName) {
      setFolderStack([
        { id: 'root', name: rootLabel },
        { id: initialFolderId, name: initialFolderName },
      ])
    } else {
      setFolderStack([{ id: 'root', name: rootLabel }])
    }
    setSelected(null)
    setMultiSelected(multiSelect ? selectedItems : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFolderId, initialFolderName, multiSelect])

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

  const queryError = driveQuery.isError
    ? driveQuery._error instanceof Error
      ? driveQuery._error.message
      : 'Erro ao carregar arquivos do Google Drive.'
    : null

  // Navigation handlers
  const handleEnterFolder = React.useCallback((item: GoogleDriveItem) => {
    if (item.kind !== 'folder') return
    setFolderStack((stack) => [...stack, { id: item.id, name: item.name }])
    setSelected(null)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleBreadcrumbClick = React.useCallback((index: number) => {
    setFolderStack((stack) => stack.slice(0, index + 1))
    setSelected(null)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleItemClick = React.useCallback((item: GoogleDriveItem) => {
    if (multiSelect && (mode === 'images' || mode === 'videos')) {
      // Multi-select mode: toggle selection (only for files, not folders)
      if (item.kind === 'folder') return

      setMultiSelected(prev => {
        const isSelected = prev.some(img => img.id === item.id)

        if (isSelected) {
          // Remove from selection
          return prev.filter(img => img.id !== item.id)
        } else {
          // Add to selection
          if (prev.length >= maxSelection) {
            const itemType = mode === 'videos' ? 'vídeos' : 'imagens'
            toast({
              variant: 'destructive',
              description: `Máximo de ${maxSelection} ${itemType} selecionados`,
            })
            return prev
          }
          return [...prev, item]
        }
      })
    } else {
      // Single select mode
      setSelected(item)
    }
  }, [multiSelect, mode, maxSelection, toast])

  const handleItemDoubleClick = React.useCallback((item: GoogleDriveItem) => {
    if (item.kind === 'folder') {
      handleEnterFolder(item)
    } else if (!multiSelect) {
      // Double-click on image selects and confirms (only in single-select mode)
      setSelected(item)
      setTimeout(() => {
        onSelect(item)
        onOpenChange(false)
      }, 100)
    }
    // In multi-select mode, double-click does nothing special
  }, [handleEnterFolder, onSelect, onOpenChange, multiSelect])

  const handleConfirm = React.useCallback(() => {
    if (mode === 'folders') {
      if (selected) {
        onSelect(selected)
        onOpenChange(false)
        return
      }
      // Allow selecting currently open folder when no specific subfolder selected
      if (currentFolder) {
        onSelect({ id: currentFolder.id, name: currentFolder.name, kind: 'folder' })
        onOpenChange(false)
      }
      return
    }

    if (multiSelect) {
      // Multi-select mode: confirm all selected items
      if (onMultiSelectConfirm) {
        onMultiSelectConfirm(multiSelected)
        onOpenChange(false)
      }
    } else {
      // Single-select mode
      if (selected) {
        onSelect(selected)
        onOpenChange(false)
      }
    }
  }, [mode, selected, currentFolder, onSelect, onOpenChange, multiSelect, multiSelected, onMultiSelectConfirm])

  const clearSearch = React.useCallback(() => {
    setSearchTerm('')
    setDebouncedSearch('')
  }, [])

  // Keyboard shortcuts
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      } else if (event.key === 'Enter' && selected) {
        event.preventDefault()
        handleConfirm()
      } else if (event.key === 'Backspace' && !searchTerm && folderStack.length > 1) {
        event.preventDefault()
        handleBreadcrumbClick(folderStack.length - 2)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, selected, searchTerm, folderStack.length, onOpenChange, handleConfirm, handleBreadcrumbClick])

  const headerTitle =
    mode === 'folders' ? 'Selecionar Pasta' :
    mode === 'videos' ? 'Escolher Vídeo do Google Drive' :
    'Escolher Imagem do Google Drive'
  const description =
    mode === 'folders'
      ? 'Escolha a pasta que receberá os backups automáticos dos criativos.'
      : mode === 'videos'
      ? 'Selecione um vídeo da pasta configurada'
      : 'Selecione uma imagem da pasta configurada'

  const isLoading = driveQuery.isLoading
  const isFetchingMore = driveQuery.isFetchingNextPage
  const emptyState = !isLoading && items.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[1000px] h-[700px] p-0 gap-0 flex flex-col md:max-w-[90vw] md:h-[80vh] sm:max-w-[95vw] sm:h-[85vh]"
      >
        <DialogTitle className="sr-only">{headerTitle}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>

        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border/40 bg-card/60 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{headerTitle}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

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

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto pb-1 scrollbar-thin">
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

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="p-6">
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
                  selected={selected}
                  multiSelected={multiSelected}
                  multiSelect={multiSelect}
                  onItemClick={handleItemClick}
                  onItemDoubleClick={handleItemDoubleClick}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-border/40 bg-muted/20 px-6 py-4">
          <div className="flex-1">
            {multiSelect ? (
              <>
                <p className="text-sm font-medium text-muted-foreground">
                  {mode === 'videos' ? 'Vídeos selecionados:' : 'Imagens selecionadas:'}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {multiSelected.length} / {maxSelection} {multiSelected.length === 1 ? (mode === 'videos' ? 'vídeo' : 'imagem') : (mode === 'videos' ? 'vídeos' : 'imagens')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-muted-foreground">
                  Seleção atual:
                </p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {selected ? selected.name : 'Nenhum item selecionado'}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={multiSelect ? multiSelected.length === 0 : (mode !== 'folders' && !selected)}
            >
              {multiSelect ? 'Confirmar Seleção' : (mode === 'folders' ? 'Selecionar' : 'Selecionar')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Loading Grid Component
function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
    <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-center">
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
    <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-center">
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
  selected: GoogleDriveItem | null
  multiSelected: GoogleDriveItem[]
  multiSelect: boolean
  onItemClick: (item: GoogleDriveItem) => void
  onItemDoubleClick: (item: GoogleDriveItem) => void
}

function ItemsGrid({ items, mode, selected, multiSelected, multiSelect, onItemClick, onItemDoubleClick }: ItemsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const isFolder = item.kind === 'folder'

        // Skip non-folders in folder selection mode
        if (mode === 'folders' && !isFolder) {
          return null
        }

        const isSelected = multiSelect
          ? multiSelected.some(img => img.id === item.id)
          : selected?.id === item.id

        return (
          <ItemCard
            key={item.id}
            item={item}
            isSelected={isSelected}
            onClick={() => onItemClick(item)}
            onDoubleClick={() => onItemDoubleClick(item)}
          />
        )
      })}
    </div>
  )
}

// Item Card Component
interface ItemCardProps {
  item: GoogleDriveItem
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
}

function ItemCard({ item, isSelected, onClick, onDoubleClick }: ItemCardProps) {
  const isFolder = item.kind === 'folder'
  const [imageState, setImageState] = React.useState<'loading' | 'loaded' | 'error'>('loading')
  const [currentSrc, setCurrentSrc] = React.useState<string | null>(null)

  // Generate thumbnail URLs with fallback chain
  const thumbnailSources = React.useMemo(() => {
    if (isFolder || !item.id) return []

    const sources: string[] = []

    // Primary: Use our proxy endpoint for authenticated access
    sources.push(`/api/google-drive/thumbnail/${item.id}?size=400`)

    // Fallback 1: If item has thumbnailLink from API
    if (item.thumbnailLink) {
      // Modify size parameter to 400
      const modifiedLink = item.thumbnailLink.replace(/=s\d+/, '=s400')
      sources.push(modifiedLink)
    }

    // Fallback 2: Full image via proxy
    sources.push(`/api/google-drive/image/${item.id}`)

    return sources
  }, [item.id, item.thumbnailLink, isFolder])

  React.useEffect(() => {
    if (isFolder || thumbnailSources.length === 0) return

    setImageState('loading')
    setCurrentSrc(thumbnailSources[0])
  }, [isFolder, thumbnailSources])

  const handleImageError = React.useCallback(() => {
    if (!currentSrc) return

    const currentIndex = thumbnailSources.indexOf(currentSrc)
    const nextIndex = currentIndex + 1

    if (nextIndex < thumbnailSources.length) {
      // Try next source
      console.warn(`[ItemCard] Thumbnail failed for ${item.name}, trying fallback ${nextIndex + 1}`)
      setCurrentSrc(thumbnailSources[nextIndex])
    } else {
      // No more fallbacks
      console.error(`[ItemCard] All thumbnail sources failed for ${item.name}`)
      setImageState('error')
    }
  }, [currentSrc, thumbnailSources, item.name])

  const handleImageLoad = React.useCallback(() => {
    setImageState('loaded')
  }, [])

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border-2 text-left transition-all',
        'hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        isSelected
          ? 'border-primary shadow-[0_0_0_1px_var(--primary)]'
          : 'border-border/40 hover:border-primary/40',
      )}
    >
      {/* Thumbnail / Icon */}
      <div className="relative aspect-square w-full bg-muted">
        {isFolder ? (
          <div className="flex h-full items-center justify-center">
            <Folder className="h-12 w-12 text-muted-foreground opacity-60" />
          </div>
        ) : currentSrc ? (
          <>
            {/* Loading skeleton */}
            {imageState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Actual image */}
            <Image
              src={currentSrc}
              alt={item.name}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={cn(
                'object-cover transition-opacity duration-200',
                imageState === 'loaded' ? 'opacity-100' : 'opacity-0',
              )}
              onError={handleImageError}
              onLoad={handleImageLoad}
              unoptimized
            />

            {/* Error state */}
            {imageState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <FileImage className="h-12 w-12 text-muted-foreground opacity-40" />
                <p className="text-[10px] text-muted-foreground opacity-60">Preview indisponível</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileImage className="h-12 w-12 text-muted-foreground opacity-40" />
          </div>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10 ring-2 ring-inset ring-primary" />
        )}
      </div>

      {/* File name */}
      <div className="relative bg-gradient-to-t from-black/60 to-transparent p-2 -mt-12 pt-12">
        <p className="text-xs font-medium text-white line-clamp-2 leading-tight">
          {item.name}
        </p>
      </div>
    </button>
  )
}

// Google Drive Folder Selector (existing component - unchanged)
type SelectorVariant = 'backup' | 'images' | 'videos'

const VARIANT_CONFIG: Record<
  SelectorVariant,
  {
    fieldId: keyof UpdateProjectSettingsInput
    fieldName: keyof UpdateProjectSettingsInput
    title: string
    description: string
    badgeLabel?: string
    badgeVariant?: 'outline' | 'default' | 'secondary'
    selectLabel: string
    changeLabel: string
    removeLabel: string
    selectToast: { title: string; description: string }
    removeToast: { title: string; description: string }
  }
> = {
  backup: {
    fieldId: 'googleDriveFolderId',
    fieldName: 'googleDriveFolderName',
    title: 'Backup no Google Drive',
    description:
      'Os criativos são salvos no Vercel Blob (primário). Configure uma pasta no Google Drive para manter uma cópia pessoal automática em ARTES LAGOSTA.',
    badgeLabel: 'Opcional',
    badgeVariant: 'outline',
    selectLabel: 'Selecionar pasta',
    changeLabel: 'Alterar pasta',
    removeLabel: 'Remover backup',
    selectToast: {
      title: 'Backup no Drive configurado!',
      description: 'Os próximos criativos serão copiados automaticamente.',
    },
    removeToast: {
      title: 'Backup no Drive desativado',
      description: 'Continuaremos salvando no Vercel Blob normalmente.',
    },
  },
  images: {
    fieldId: 'googleDriveImagesFolderId',
    fieldName: 'googleDriveImagesFolderName',
    title: 'Pasta de Fotos (Imagens)',
    description:
      'Defina a pasta padrão de imagens do projeto. Ela será usada nas buscas do editor, logos e elementos importados do Drive.',
    badgeLabel: 'Editor',
    badgeVariant: 'secondary',
    selectLabel: 'Selecionar pasta de fotos',
    changeLabel: 'Alterar pasta de fotos',
    removeLabel: 'Remover pasta de fotos',
    selectToast: {
      title: 'Pasta de imagens definida!',
      description: 'O editor vai usar esta pasta como fonte principal de fotos.',
    },
    removeToast: {
      title: 'Pasta de imagens removida',
      description: 'Voltaremos a usar o fallback padrão para fotos.',
    },
  },
  videos: {
    fieldId: 'googleDriveVideosFolderId',
    fieldName: 'googleDriveVideosFolderName',
    title: 'Pasta de Vídeos',
    description:
      'Escolha a pasta no Google Drive com os vídeos de referência para o editor. Ela aparece na aba de vídeos do template.',
    badgeLabel: 'Editor',
    badgeVariant: 'secondary',
    selectLabel: 'Selecionar pasta de vídeos',
    changeLabel: 'Alterar pasta de vídeos',
    removeLabel: 'Remover pasta de vídeos',
    selectToast: {
      title: 'Pasta de vídeos definida!',
      description: 'Os vídeos da aba do editor serão carregados desta pasta.',
    },
    removeToast: {
      title: 'Pasta de vídeos removida',
      description: 'Voltaremos a usar o fallback padrão para vídeos.',
    },
  },
}

interface GoogleDriveFolderSelectorProps {
  projectId: number
  folderId: string | null
  folderName: string | null
  variant?: SelectorVariant
}

export function GoogleDriveFolderSelector({
  projectId,
  folderId,
  folderName,
  variant = 'backup',
}: GoogleDriveFolderSelectorProps) {
  const config = VARIANT_CONFIG[variant]
  const [modalOpen, setModalOpen] = React.useState(false)
  const updateSettings = useUpdateProjectSettings(projectId)
  const { toast } = useToast()

  const handleSelect = async (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => {
    try {
      await updateSettings.mutateAsync({
        [config.fieldId]: item.id,
        [config.fieldName]: item.name,
      } as UpdateProjectSettingsInput)
      toast(config.selectToast)
    } catch (_error) {
      console.error('[GoogleDriveFolderSelector] Failed to save folder', _error)
      toast({
        title: 'Erro ao salvar pasta',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    }
  }

  const handleRemove = async () => {
    try {
      await updateSettings.mutateAsync({
        [config.fieldId]: null,
        [config.fieldName]: null,
      } as UpdateProjectSettingsInput)
      toast(config.removeToast)
    } catch (_error) {
      console.error('[GoogleDriveFolderSelector] Failed to remove folder', _error)
      toast({
        title: 'Erro ao remover pasta',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{config.title}</h3>
            {config.badgeLabel && (
              <Badge variant={config.badgeVariant ?? 'outline'} className="text-xs uppercase">
                {config.badgeLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{config.description}</p>
          {folderId && folderName ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">Pasta selecionada</Badge>
              <span className="font-medium">{folderName}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma pasta configurada no momento.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setModalOpen(true)} disabled={updateSettings.isPending}>
            {folderId ? config.changeLabel : config.selectLabel}
          </Button>
          {folderId && (
            <Button variant="ghost" onClick={handleRemove} disabled={updateSettings.isPending}>
              {config.removeLabel}
            </Button>
          )}
        </div>
      </div>

      <DesktopGoogleDriveModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode="folders"
        initialFolderId={folderId ?? undefined}
        initialFolderName={folderName ?? undefined}
        onSelect={handleSelect}
      />
    </Card>
  )
}
