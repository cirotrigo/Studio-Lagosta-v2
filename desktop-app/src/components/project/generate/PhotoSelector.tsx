import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { AlertCircle, FolderOpen, Search, Sparkles, Upload, X, Loader2, Image as ImageIcon, LucideIcon, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAIImages, DrivePhoto, AIImage } from '@/hooks/use-art-generation'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import type { ArtFormat } from '@/stores/generation.store'
import { useProjectStore } from '@/stores/project.store'

interface SelectedPhotoRef {
  url: string
  source: string
  format?: ArtFormat
  aspectRatio?: string
  width?: number
  height?: number
}

interface PhotoSelectorProps {
  projectId: number
  selectedPhoto: SelectedPhotoRef | null
  onPhotoChange: (photo: SelectedPhotoRef | null) => void
  allowedTabs?: PhotoTab[]
}

export type PhotoTab = 'drive' | 'ai' | 'upload'

const TABS: { id: PhotoTab; label: string; icon: LucideIcon }[] = [
  { id: 'drive', label: 'Drive', icon: FolderOpen },
  { id: 'ai', label: 'Geradas com IA', icon: Sparkles },
  { id: 'upload', label: 'Upload', icon: Upload },
]
const DEFAULT_ALLOWED_TABS: PhotoTab[] = ['drive', 'ai', 'upload']
const DRIVE_LIST_CACHE_TTL_MS = 60_000

interface ProjectDriveImagesPayload {
  images: DrivePhoto[]
  nextOffset?: number
}

const driveListCache = new Map<string, { data: ProjectDriveImagesPayload; timestamp: number }>()
const driveListInflight = new Map<string, Promise<ProjectDriveImagesPayload>>()

export default function PhotoSelector({
  projectId,
  selectedPhoto,
  onPhotoChange,
  allowedTabs = DEFAULT_ALLOWED_TABS,
}: PhotoSelectorProps) {
  const currentProject = useProjectStore((state) =>
    state.currentProject?.id === projectId ? state.currentProject : null,
  )
  const hasDriveTab = allowedTabs.includes('drive')
  const hasAiTab = allowedTabs.includes('ai')
  const hasUploadTab = allowedTabs.includes('upload')
  const firstAllowedTab = allowedTabs[0] ?? 'drive'
  const initialDriveFolderName =
    currentProject?.googleDriveImagesFolderName ?? currentProject?.googleDriveFolderName ?? undefined
  const [activeTab, setActiveTab] = useState<PhotoTab>(firstAllowedTab)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedNaturalAspect, setSelectedNaturalAspect] = useState<string | null>(null)
  const [driveItems, setDriveItems] = useState<DrivePhoto[]>([])
  const [driveSearchInput, setDriveSearchInput] = useState('')
  const [driveSearch, setDriveSearch] = useState('')
  const [driveError, setDriveError] = useState<string | null>(null)
  const [isLoadingDrive, setIsLoadingDrive] = useState(false)
  const driveRequestKeyRef = useRef<string | null>(null)

  const { data: aiImages, isLoading: isLoadingAI } = useAIImages(projectId)
  const visibleTabs = TABS.filter((tab) => allowedTabs.includes(tab.id))
  const filteredDriveItems = useMemo(() => {
    if (!driveSearch) {
      return driveItems
    }

    const normalizedSearch = driveSearch.toLowerCase()
    return driveItems.filter((item) => item.name.toLowerCase().includes(normalizedSearch))
  }, [driveItems, driveSearch])

  useEffect(() => {
    if (
      (activeTab === 'drive' && hasDriveTab)
      || (activeTab === 'ai' && hasAiTab)
      || (activeTab === 'upload' && hasUploadTab)
    ) {
      return
    }

    setActiveTab(firstAllowedTab)
  }, [activeTab, firstAllowedTab, hasAiTab, hasDriveTab, hasUploadTab])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDriveSearch(driveSearchInput.trim())
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [driveSearchInput])

  const loadDriveItems = useCallback(async (forceRefresh = false) => {
    setIsLoadingDrive(true)
    setDriveError(null)
    const cacheKey = String(projectId)
    driveRequestKeyRef.current = cacheKey

    try {
      const cached = forceRefresh ? undefined : driveListCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < DRIVE_LIST_CACHE_TTL_MS) {
        if (driveRequestKeyRef.current !== cacheKey) {
          return
        }

        setDriveItems(cached.data.images)
        return
      }

      const existingRequest = driveListInflight.get(cacheKey)
      const request =
        existingRequest ??
        (async () => {
          return await api.get<ProjectDriveImagesPayload>(
            `/api/projects/${projectId}/google-drive/images?offset=0&limit=60`,
          )
        })()

      if (!existingRequest) {
        driveListInflight.set(cacheKey, request)
      }

      const data = await request
      driveListCache.set(cacheKey, { data, timestamp: Date.now() })

      if (driveRequestKeyRef.current !== cacheKey) {
        return
      }

      setDriveItems(data.images)
    } catch (error) {
      const cached = driveListCache.get(cacheKey)
      if (cached && error instanceof ApiError && error.status === 429) {
        if (driveRequestKeyRef.current === cacheKey) {
          setDriveItems(cached.data.images)
          setDriveError(null)
        }
        return
      }

      if (driveRequestKeyRef.current === cacheKey) {
        setDriveItems([])
        setDriveError(error instanceof Error ? error.message : 'Erro ao carregar imagens do Drive')
      }
    } finally {
      driveListInflight.delete(cacheKey)
      if (driveRequestKeyRef.current === cacheKey) {
        setIsLoadingDrive(false)
      }
    }
  }, [projectId])

  useEffect(() => {
    setDriveItems([])
    setDriveError(null)
    setDriveSearchInput('')
    setDriveSearch('')
  }, [projectId])

  useEffect(() => {
    if (!projectId || !hasDriveTab || selectedPhoto) {
      return
    }

    void loadDriveItems()
  }, [hasDriveTab, loadDriveItems, projectId, selectedPhoto])

  const resolveAspectRatio = useCallback((photo: SelectedPhotoRef | null): string => {
    if (!photo) return '4 / 5'
    if (photo.aspectRatio && photo.aspectRatio.includes(':')) {
      const [w, h] = photo.aspectRatio.split(':').map((v) => Number(v.trim()))
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return `${w} / ${h}`
      }
    }
    if (
      Number.isFinite(photo.width)
      && Number.isFinite(photo.height)
      && (photo.width || 0) > 0
      && (photo.height || 0) > 0
    ) {
      return `${photo.width} / ${photo.height}`
    }
    if (photo.format === 'STORY') return '9 / 16'
    if (photo.format === 'SQUARE') return '1 / 1'
    if (photo.format === 'FEED_PORTRAIT') return '4 / 5'
    return '4 / 5'
  }, [])

  const resolveAspectRatioValue = useCallback((image: AIImage): string => {
    if (image.aspectRatio && image.aspectRatio.includes(':')) {
      const [w, h] = image.aspectRatio.split(':').map((v) => Number(v.trim()))
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return `${w} / ${h}`
      }
    }
    if (typeof image.width === 'number' && typeof image.height === 'number' && image.width > 0 && image.height > 0) {
      return `${image.width} / ${image.height}`
    }
    if (image.format === 'STORY') return '9 / 16'
    if (image.format === 'SQUARE') return '1 / 1'
    return '4 / 5'
  }, [])

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (uploadPreview) {
        URL.revokeObjectURL(uploadPreview)
      }
    }
  }, [uploadPreview])

  useEffect(() => {
    setSelectedNaturalAspect(null)
  }, [selectedPhoto?.url])

  const handleDriveSelect = useCallback(async (photo: DrivePhoto) => {
    setDownloadingId(photo.id)
    try {
      // Get download URL
      const response = await window.electronAPI.apiRequest(
        'https://studio-lagosta-v2.vercel.app/api/google-drive-download',
        {
          method: 'POST',
          body: JSON.stringify({ projectId, fileIds: [photo.id] }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!response.ok) {
        throw new Error('Erro ao obter URL da foto')
      }

      const data = response.data as { files: Array<{ url: string }> }
      if (data.files?.[0]?.url) {
        onPhotoChange({ url: data.files[0].url, source: 'drive' })
        toast.success('Foto selecionada!')
      }
    } catch (error) {
      toast.error('Erro ao selecionar foto')
    } finally {
      setDownloadingId(null)
    }
  }, [projectId, onPhotoChange])

  const handleAISelect = useCallback((image: AIImage) => {
    onPhotoChange({
      url: image.fileUrl,
      source: 'ai',
      format: image.format,
      aspectRatio: image.aspectRatio,
      width: image.width,
      height: image.height,
    })
    toast.success('Foto selecionada!')
  }, [onPhotoChange])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato invalido. Use JPEG, PNG ou WebP')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande. Maximo 20MB')
      return
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file)
    setUploadPreview(previewUrl)

    // Upload file
    try {
      const arrayBuffer = await file.arrayBuffer()
      const response = await window.electronAPI.uploadFile(
        'https://studio-lagosta-v2.vercel.app/api/upload',
        {
          name: file.name,
          type: file.type,
          buffer: arrayBuffer,
        },
        { type: 'photo' }
      )

      if (!response.ok) {
        throw new Error('Erro ao fazer upload')
      }

      const data = response.data as { url: string }
      onPhotoChange({ url: data.url, source: 'upload' })
      toast.success('Foto enviada!')
    } catch (error) {
      toast.error('Erro ao enviar foto')
      setUploadPreview(null)
    }

    e.target.value = ''
  }, [onPhotoChange])

  const handleRemove = useCallback(() => {
    onPhotoChange(null)
    setSelectedNaturalAspect(null)
    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview)
      setUploadPreview(null)
    }
  }, [onPhotoChange, uploadPreview])

  // Show selected photo preview
  if (selectedPhoto) {
    return (
      <div
        className="relative w-full max-w-[220px] overflow-hidden rounded-xl border border-border bg-card"
        style={{ aspectRatio: selectedNaturalAspect || resolveAspectRatio(selectedPhoto) }}
      >
        <img
          src={selectedPhoto.url}
          alt="Foto selecionada"
          className="h-full w-full object-contain bg-zinc-950"
          onLoad={(event) => {
            const img = event.currentTarget
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setSelectedNaturalAspect(`${img.naturalWidth} / ${img.naturalHeight}`)
            }
          }}
        />
        <button
          onClick={handleRemove}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
        >
          <X size={16} />
        </button>
        <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
          {selectedPhoto.source === 'drive' ? 'Drive' : selectedPhoto.source === 'ai' ? 'IA' : 'Upload'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-input p-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-card text-text shadow-sm'
                : 'text-text-muted hover:text-text'
            )}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {activeTab === 'drive' && hasDriveTab && (
          <DriveTab
            items={filteredDriveItems}
            isLoading={isLoadingDrive}
            error={driveError}
            search={driveSearchInput}
            folderName={initialDriveFolderName}
            downloadingId={downloadingId}
            onRefresh={() => void loadDriveItems(true)}
            onSearchChange={(value) => {
              setDriveSearchInput(value)
            }}
            onSelect={handleDriveSelect}
          />
        )}
        {activeTab === 'ai' && hasAiTab && (
          <AITab
            images={aiImages || []}
            isLoading={isLoadingAI}
            onSelect={handleAISelect}
            resolveAspectRatioValue={resolveAspectRatioValue}
          />
        )}
        {activeTab === 'upload' && hasUploadTab && (
          <UploadTab
            onFileSelect={handleFileUpload}
          />
        )}
      </div>
    </div>
  )
}

// Drive Tab Component
function DriveTab({
  items,
  isLoading,
  error,
  search,
  folderName,
  downloadingId,
  onRefresh,
  onSearchChange,
  onSelect,
}: {
  items: DrivePhoto[]
  isLoading: boolean
  error: string | null
  search: string
  folderName?: string
  downloadingId: string | null
  onRefresh: () => void
  onSearchChange: (value: string) => void
  onSelect: (photo: DrivePhoto) => void
}) {
  const photos = items.filter((item) => item.mimeType?.startsWith('image/'))

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
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
          <Search size={14} className="text-text-muted" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-input/50 py-8 text-center">
          <AlertCircle size={32} className="mb-2 text-error" />
          <p className="text-sm font-medium text-text">Erro ao carregar o Drive</p>
          <p className="mt-1 max-w-[280px] text-xs text-text-muted">{error}</p>
        </div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
          <Search size={14} className="text-text-muted" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
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
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FolderOpen size={32} className="mb-2 text-text-subtle" />
          <p className="text-sm text-text-muted">
            {search ? 'Nenhuma imagem encontrada' : 'Nenhuma foto na pasta configurada do projeto'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {folderName ? (
        <div className="rounded-lg border border-border bg-background/30 px-3 py-2 text-xs text-text-muted">
          Pasta do projeto: <span className="font-medium text-text">{folderName}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
        <Search size={14} className="text-text-muted" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
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

      <div className="grid grid-cols-3 gap-2">
        {photos.slice(0, 18).map((photo) => (
          <button
            key={photo.id}
            onClick={() => onSelect(photo)}
            disabled={downloadingId === photo.id}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card transition-all hover:ring-2 hover:ring-primary/50"
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
          </button>
        ))}
      </div>
    </div>
  )
}

function DriveThumbnail({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) {
      return
    }

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
      } catch (_error) {
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
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
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

// AI Tab Component
function AITab({
  images,
  isLoading,
  onSelect,
  resolveAspectRatioValue,
}: {
  images: AIImage[]
  isLoading: boolean
  onSelect: (image: AIImage) => void
  resolveAspectRatioValue: (image: AIImage) => string
}) {
  const [naturalAspectById, setNaturalAspectById] = useState<Record<string, string>>({})

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
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.slice(0, 12).map((image) => (
        <button
          key={image.id}
          onClick={() => onSelect(image)}
          className={cn(
            'group relative overflow-hidden rounded-lg border border-border bg-card transition-all hover:ring-2 hover:ring-primary/50'
          )}
          style={{ aspectRatio: naturalAspectById[image.id] || resolveAspectRatioValue(image) }}
        >
          <img
            src={image.fileUrl}
            alt={image.name}
            className="h-full w-full object-contain bg-zinc-950"
            onLoad={(event) => {
              const img = event.currentTarget
              if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return
              const next = `${img.naturalWidth} / ${img.naturalHeight}`
              setNaturalAspectById((prev) => (prev[image.id] === next ? prev : { ...prev, [image.id]: next }))
            }}
          />
        </button>
      ))}
    </div>
  )
}

// Upload Tab Component
function UploadTab({
  onFileSelect,
}: {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-input transition-all duration-200 hover:border-primary/50">
      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={onFileSelect}
        className="hidden"
      />
      <Upload size={32} className="mb-2 text-text-muted" />
      <p className="text-sm font-medium text-text">Clique para selecionar</p>
      <p className="mt-1 text-xs text-text-muted">JPEG, PNG ou WebP (max 20MB)</p>
    </label>
  )
}
