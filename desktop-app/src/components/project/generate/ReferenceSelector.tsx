import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  AlertCircle,
  ChevronRight,
  FolderOpen,
  Search,
  Sparkles,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  LucideIcon,
  RefreshCw,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAIImages, DrivePhoto, AIImage } from '@/hooks/use-art-generation'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { useProjectStore } from '@/stores/project.store'

const MAX_REFERENCES = 5

interface SelectedReference {
  id: string
  url: string
  source: 'drive' | 'ai' | 'upload'
  name?: string
  file?: File
}

interface ReferenceSelectorProps {
  projectId: number
  selectedReferences: SelectedReference[]
  onReferencesChange: (refs: SelectedReference[]) => void
}

type ReferenceTab = 'drive' | 'ai' | 'upload'

const TABS: { id: ReferenceTab; label: string; icon: LucideIcon }[] = [
  { id: 'drive', label: 'Drive', icon: FolderOpen },
  { id: 'ai', label: 'Geradas com IA', icon: Sparkles },
  { id: 'upload', label: 'Upload', icon: Upload },
]

const DRIVE_LIST_CACHE_TTL_MS = 60_000

interface DriveListPayload {
  items: DrivePhoto[]
  currentFolderId: string
  folderName?: string
  nextPageToken?: string
}

const driveListCache = new Map<string, { data: DriveListPayload; timestamp: number }>()
const driveListInflight = new Map<string, Promise<DriveListPayload>>()

export default function ReferenceSelector({
  projectId,
  selectedReferences,
  onReferencesChange,
}: ReferenceSelectorProps) {
  const currentProject = useProjectStore((state) =>
    state.currentProject?.id === projectId ? state.currentProject : null,
  )

  const initialDriveFolderId =
    currentProject?.googleDriveImagesFolderId ?? currentProject?.googleDriveFolderId ?? undefined
  const initialDriveFolderName =
    currentProject?.googleDriveImagesFolderName ?? currentProject?.googleDriveFolderName ?? undefined

  const [activeTab, setActiveTab] = useState<ReferenceTab>('drive')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [driveItems, setDriveItems] = useState<DrivePhoto[]>([])
  const [driveFolderStack, setDriveFolderStack] = useState<Array<{ id: string; name: string }>>([])
  const [driveSearchInput, setDriveSearchInput] = useState('')
  const [driveSearch, setDriveSearch] = useState('')
  const [driveError, setDriveError] = useState<string | null>(null)
  const [isLoadingDrive, setIsLoadingDrive] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [driveNextPageToken, setDriveNextPageToken] = useState<string | undefined>(undefined)
  const driveRequestKeyRef = useRef<string | null>(null)

  const { data: aiImages, isLoading: isLoadingAI } = useAIImages(projectId)

  const currentDriveFolderId = driveFolderStack[driveFolderStack.length - 1]?.id ?? initialDriveFolderId

  const filteredDriveItems = useMemo(() => {
    if (!driveSearch) {
      return driveItems
    }
    const normalizedSearch = driveSearch.toLowerCase()
    return driveItems.filter((item) => item.name.toLowerCase().includes(normalizedSearch))
  }, [driveItems, driveSearch])

  const canAddMore = selectedReferences.length < MAX_REFERENCES

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDriveSearch(driveSearchInput.trim())
    }, 250)
    return () => window.clearTimeout(timeoutId)
  }, [driveSearchInput])

  const loadDriveItems = useCallback(
    async (folderId?: string, forceRefresh = false, pageToken?: string) => {
      const isLoadingMore = !!pageToken
      if (isLoadingMore) {
        setIsLoadingMore(true)
      } else {
        setIsLoadingDrive(true)
        setDriveNextPageToken(undefined)
      }
      setDriveError(null)
      const cacheKey = `${projectId}:${folderId ?? 'root'}:${pageToken ?? ''}`
      driveRequestKeyRef.current = cacheKey

      try {
        if (!isLoadingMore) {
          const cached = forceRefresh ? undefined : driveListCache.get(cacheKey)
          if (cached && Date.now() - cached.timestamp < DRIVE_LIST_CACHE_TTL_MS) {
            if (driveRequestKeyRef.current !== cacheKey) return

            setDriveItems(cached.data.items)
            setDriveNextPageToken(cached.data.nextPageToken)
            setDriveFolderStack((previous) => {
              if (previous.length > 0 || !cached.data.currentFolderId) return previous
              return [
                {
                  id: cached.data.currentFolderId,
                  name: initialDriveFolderName ?? cached.data.folderName ?? 'Google Drive',
                },
              ]
            })
            return
          }
        }

        const existingRequest = driveListInflight.get(cacheKey)
        const request =
          existingRequest ??
          (async () => {
            const params = new URLSearchParams({
              projectId: String(projectId),
              folder: 'images',
            })
            if (folderId) params.set('folderId', folderId)
            if (pageToken) params.set('pageToken', pageToken)
            return await api.get<DriveListPayload>(`/api/drive/list?${params.toString()}`)
          })()

        if (!existingRequest) {
          driveListInflight.set(cacheKey, request)
        }

        const data = await request

        if (!isLoadingMore) {
          driveListCache.set(cacheKey, { data, timestamp: Date.now() })
        }

        if (driveRequestKeyRef.current !== cacheKey) return

        if (isLoadingMore) {
          setDriveItems((prev) => [...prev, ...data.items])
        } else {
          setDriveItems(data.items)
        }

        setDriveNextPageToken(data.nextPageToken)

        if (!isLoadingMore) {
          setDriveFolderStack((previous) => {
            if (previous.length > 0 || !data.currentFolderId) return previous
            return [
              {
                id: data.currentFolderId,
                name: initialDriveFolderName ?? data.folderName ?? 'Google Drive',
              },
            ]
          })
        }
      } catch (error) {
        const cached = driveListCache.get(cacheKey)
        if (cached && error instanceof ApiError && error.status === 429) {
          if (driveRequestKeyRef.current === cacheKey) {
            if (!isLoadingMore) {
              setDriveItems(cached.data.items)
              setDriveNextPageToken(cached.data.nextPageToken)
            }
            setDriveError(null)
          }
          return
        }

        if (driveRequestKeyRef.current === cacheKey) {
          if (!isLoadingMore) setDriveItems([])
          setDriveError(error instanceof Error ? error.message : 'Erro ao carregar imagens do Drive')
        }
      } finally {
        driveListInflight.delete(cacheKey)
        if (driveRequestKeyRef.current === cacheKey) {
          if (isLoadingMore) {
            setIsLoadingMore(false)
          } else {
            setIsLoadingDrive(false)
          }
        }
      }
    },
    [initialDriveFolderName, projectId],
  )

  useEffect(() => {
    setDriveItems([])
    setDriveError(null)
    setDriveSearchInput('')
    setDriveSearch('')
    setDriveFolderStack(
      initialDriveFolderId
        ? [{ id: initialDriveFolderId, name: initialDriveFolderName ?? 'Google Drive' }]
        : [],
    )
  }, [initialDriveFolderId, initialDriveFolderName, projectId])

  useEffect(() => {
    if (!projectId || activeTab !== 'drive') return
    void loadDriveItems(currentDriveFolderId)
  }, [currentDriveFolderId, loadDriveItems, projectId, activeTab])

  const isSelected = useCallback(
    (id: string) => selectedReferences.some((ref) => ref.id === id),
    [selectedReferences],
  )

  const handleRemoveReference = useCallback(
    (id: string) => {
      const ref = selectedReferences.find((r) => r.id === id)
      if (ref?.source === 'upload' && ref.url.startsWith('blob:')) {
        URL.revokeObjectURL(ref.url)
      }
      onReferencesChange(selectedReferences.filter((r) => r.id !== id))
    },
    [selectedReferences, onReferencesChange],
  )

  const handleDriveSelect = useCallback(
    async (photo: DrivePhoto) => {
      if (isSelected(photo.id)) {
        handleRemoveReference(photo.id)
        return
      }

      if (!canAddMore) {
        toast.error(`Maximo de ${MAX_REFERENCES} referencias`)
        return
      }

      setDownloadingId(photo.id)
      try {
        const response = await window.electronAPI.apiRequest(
          'https://studio-lagosta-v2.vercel.app/api/google-drive-download',
          {
            method: 'POST',
            body: JSON.stringify({ projectId, fileIds: [photo.id] }),
            headers: { 'Content-Type': 'application/json' },
          },
        )

        if (!response.ok) throw new Error('Erro ao obter URL da foto')

        const data = response.data as { files: Array<{ url: string }> }
        if (data.files?.[0]?.url) {
          onReferencesChange([
            ...selectedReferences,
            { id: photo.id, url: data.files[0].url, source: 'drive', name: photo.name },
          ])
        }
      } catch {
        toast.error('Erro ao selecionar foto')
      } finally {
        setDownloadingId(null)
      }
    },
    [projectId, selectedReferences, onReferencesChange, isSelected, handleRemoveReference, canAddMore],
  )

  const handleAISelect = useCallback(
    (image: AIImage) => {
      if (isSelected(image.id)) {
        handleRemoveReference(image.id)
        return
      }

      if (!canAddMore) {
        toast.error(`Maximo de ${MAX_REFERENCES} referencias`)
        return
      }

      onReferencesChange([
        ...selectedReferences,
        { id: image.id, url: image.fileUrl, source: 'ai', name: image.name },
      ])
    },
    [selectedReferences, onReferencesChange, isSelected, handleRemoveReference, canAddMore],
  )

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(
        (file) => ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE,
      )

      if (files.length === 0) {
        toast.error('Nenhum arquivo valido selecionado')
        return
      }

      const availableSlots = MAX_REFERENCES - selectedReferences.length
      if (files.length > availableSlots) {
        toast.error(`Voce pode adicionar no maximo ${availableSlots} arquivo(s)`)
      }

      const filesToAdd = files.slice(0, availableSlots)
      const newRefs: SelectedReference[] = filesToAdd.map((file) => ({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url: URL.createObjectURL(file),
        source: 'upload' as const,
        name: file.name,
        file,
      }))

      onReferencesChange([...selectedReferences, ...newRefs])
      e.target.value = ''
    },
    [selectedReferences, onReferencesChange],
  )

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <p className="text-sm font-medium text-text">Referencias visuais</p>
        <p className="mt-1 text-xs text-text-muted">
          Ate {MAX_REFERENCES} imagens. O fundo IA usa essas referencias diretamente e salva o resultado em
          Geradas com IA.
        </p>
      </div>

      {/* Selected References Preview */}
      {selectedReferences.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedReferences.map((ref) => (
            <div
              key={ref.id}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-card"
            >
              <img src={ref.url} alt={ref.name || ''} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemoveReference(ref.id)}
                className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1 text-white group-hover:block"
              >
                <X size={12} />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[8px] text-white">
                {ref.source === 'drive' ? 'Drive' : ref.source === 'ai' ? 'IA' : 'Upload'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-input p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200',
              activeTab === tab.id ? 'bg-card text-text shadow-sm' : 'text-text-muted hover:text-text',
            )}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {activeTab === 'drive' && (
          <DriveTabContent
            items={filteredDriveItems}
            isLoading={isLoadingDrive}
            isLoadingMore={isLoadingMore}
            hasMore={!!driveNextPageToken && !driveSearch}
            error={driveError}
            search={driveSearchInput}
            breadcrumbs={driveFolderStack}
            downloadingId={downloadingId}
            selectedIds={selectedReferences.filter((r) => r.source === 'drive').map((r) => r.id)}
            canAddMore={canAddMore}
            onRefresh={() => void loadDriveItems(currentDriveFolderId, true)}
            onLoadMore={() => {
              if (driveNextPageToken && !isLoadingMore) {
                void loadDriveItems(currentDriveFolderId, false, driveNextPageToken)
              }
            }}
            onSearchChange={setDriveSearchInput}
            onOpenFolder={(folder) => {
              setDriveFolderStack((previous) => {
                const existingIndex = previous.findIndex((item) => item.id === folder.id)
                if (existingIndex >= 0) return previous.slice(0, existingIndex + 1)
                return [...previous, { id: folder.id, name: folder.name }]
              })
              setDriveSearchInput('')
              setDriveSearch('')
            }}
            onBreadcrumbClick={(index) => {
              setDriveFolderStack((previous) => {
                const crumb = previous[index]
                if (!crumb) return previous
                return previous.slice(0, index + 1)
              })
              setDriveSearchInput('')
              setDriveSearch('')
            }}
            onSelect={handleDriveSelect}
          />
        )}
        {activeTab === 'ai' && (
          <AITabContent
            images={aiImages || []}
            isLoading={isLoadingAI}
            selectedIds={selectedReferences.filter((r) => r.source === 'ai').map((r) => r.id)}
            canAddMore={canAddMore}
            onSelect={handleAISelect}
          />
        )}
        {activeTab === 'upload' && (
          <UploadTabContent onFileSelect={handleFileUpload} canAddMore={canAddMore} />
        )}
      </div>
    </div>
  )
}

// Drive Tab Content
function DriveTabContent({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  search,
  breadcrumbs,
  downloadingId,
  selectedIds,
  canAddMore,
  onRefresh,
  onLoadMore,
  onSearchChange,
  onOpenFolder,
  onBreadcrumbClick,
  onSelect,
}: {
  items: DrivePhoto[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: string | null
  search: string
  breadcrumbs: Array<{ id: string; name: string }>
  downloadingId: string | null
  selectedIds: string[]
  canAddMore: boolean
  onRefresh: () => void
  onLoadMore: () => void
  onSearchChange: (value: string) => void
  onOpenFolder: (folder: DrivePhoto) => void
  onBreadcrumbClick: (index: number) => void
  onSelect: (photo: DrivePhoto) => void
}) {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const folders = items.filter((item) => item.mimeType === 'application/vnd.google-apps.folder')
  const photos = items.filter((item) => item.mimeType?.startsWith('image/'))

  useEffect(() => {
    if (!hasMore || isLoadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { threshold: 0.1 },
    )

    const target = loadMoreRef.current
    if (target) observer.observe(target)

    return () => {
      if (target) observer.unobserve(target)
    }
  }, [hasMore, isLoadingMore, onLoadMore])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        <SearchBar value={search} onChange={onSearchChange} onRefresh={onRefresh} />
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-input/50 py-8 text-center">
          <AlertCircle size={32} className="mb-2 text-error" />
          <p className="text-sm font-medium text-text">Erro ao carregar o Drive</p>
          <p className="mt-1 max-w-[280px] text-xs text-text-muted">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {breadcrumbs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background/30 px-2 py-2 text-xs text-text-muted">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center gap-1">
              {index > 0 && <ChevronRight size={12} className="text-text-subtle" />}
              <button
                type="button"
                onClick={() => onBreadcrumbClick(index)}
                className={cn(
                  'rounded px-1.5 py-0.5 transition-colors hover:bg-card hover:text-text',
                  index === breadcrumbs.length - 1 && 'font-medium text-text',
                )}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>
      )}

      <SearchBar value={search} onChange={onSearchChange} onRefresh={onRefresh} />

      {folders.length > 0 && (
        <div className="space-y-2">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onOpenFolder(folder)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-text transition-colors hover:bg-card/70"
            >
              <span className="flex items-center gap-2 truncate">
                <FolderOpen size={16} className="shrink-0 text-text-muted" />
                <span className="truncate">{folder.name}</span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-text-muted" />
            </button>
          ))}
        </div>
      )}

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => {
            const selected = selectedIds.includes(photo.id)
            const disabled = !selected && !canAddMore
            return (
              <button
                key={photo.id}
                onClick={() => onSelect(photo)}
                disabled={downloadingId === photo.id || disabled}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg border bg-card transition-all',
                  selected
                    ? 'border-primary ring-2 ring-primary'
                    : 'border-border hover:ring-2 hover:ring-primary/50',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
                title={photo.name}
              >
                <DriveThumbnail fileId={photo.id} fileName={photo.name} />
                <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left">
                  <p className="truncate text-[10px] text-white">{photo.name}</p>
                </div>
                {downloadingId === photo.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
                {selected && (
                  <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check size={12} className="text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        folders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FolderOpen size={32} className="mb-2 text-text-subtle" />
            <p className="text-sm text-text-muted">
              {search ? 'Nenhum item encontrado' : 'Nenhuma foto nesta pasta'}
            </p>
          </div>
        )
      )}

      {hasMore && (
        <div ref={loadMoreRef} className="flex items-center justify-center py-4">
          {isLoadingMore ? (
            <Loader2 size={20} className="animate-spin text-primary" />
          ) : (
            <span className="text-xs text-text-muted">Carregando mais...</span>
          )}
        </div>
      )}
    </div>
  )
}

function SearchBar({
  value,
  onChange,
  onRefresh,
}: {
  value: string
  onChange: (value: string) => void
  onRefresh: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
      <Search size={14} className="text-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar no Drive"
        className="flex-1 bg-transparent text-sm text-text focus:outline-none"
      />
      <button
        type="button"
        onClick={onRefresh}
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card hover:text-text"
      >
        <RefreshCw size={14} />
      </button>
    </div>
  )
}

function DriveThumbnail({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return

    let cancelled = false

    async function loadThumbnail() {
      try {
        const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200-h200`
        const response = await window.electronAPI.downloadBlob(thumbUrl)
        if (!cancelled && response.ok && response.buffer) {
          const blob = new Blob([response.buffer], { type: response.contentType || 'image/jpeg' })
          const objectUrl = URL.createObjectURL(blob)
          setPreviewUrl(objectUrl)
          loadedRef.current = true
        }
      } catch {
        // keep placeholder
      }
    }

    void loadThumbnail()

    return () => {
      cancelled = true
    }
  }, [fileId])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  if (previewUrl) {
    return <img src={previewUrl} alt={fileName} className="h-full w-full object-cover" />
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-input">
      <ImageIcon size={24} className="text-text-subtle" />
    </div>
  )
}

// AI Tab Content
function AITabContent({
  images,
  isLoading,
  selectedIds,
  canAddMore,
  onSelect,
}: {
  images: AIImage[]
  isLoading: boolean
  selectedIds: string[]
  canAddMore: boolean
  onSelect: (image: AIImage) => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Sparkles size={32} className="mb-2 text-text-subtle" />
        <p className="text-sm text-text-muted">Nenhuma imagem gerada</p>
        <p className="mt-1 text-xs text-text-subtle">
          As imagens geradas com IA aparecerao aqui
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.slice(0, 18).map((image) => {
        const selected = selectedIds.includes(image.id)
        const disabled = !selected && !canAddMore
        return (
          <button
            key={image.id}
            onClick={() => onSelect(image)}
            disabled={disabled}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-lg border bg-card transition-all',
              selected
                ? 'border-primary ring-2 ring-primary'
                : 'border-border hover:ring-2 hover:ring-primary/50',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <img src={image.fileUrl} alt={image.name} className="h-full w-full object-cover" />
            {selected && (
              <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check size={12} className="text-white" />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Upload Tab Content
function UploadTabContent({
  onFileSelect,
  canAddMore,
}: {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  canAddMore: boolean
}) {
  return (
    <label
      className={cn(
        'flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-input transition-all duration-200',
        canAddMore ? 'hover:border-primary/50' : 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        onChange={onFileSelect}
        disabled={!canAddMore}
        className="hidden"
      />
      <Upload size={32} className="mb-2 text-text-muted" />
      <p className="text-sm font-medium text-text">Clique para selecionar</p>
      <p className="mt-1 text-xs text-text-muted">JPEG, PNG ou WebP (max 20MB)</p>
    </label>
  )
}

// Export types for use in GenerateArtTab
export type { SelectedReference }
