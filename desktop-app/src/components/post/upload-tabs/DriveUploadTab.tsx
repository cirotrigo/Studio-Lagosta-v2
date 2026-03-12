import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, FolderOpen, Image as ImageIcon, ChevronRight, Search, AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api-client'
import { PostType, MAX_CAROUSEL_IMAGES } from '@/lib/constants'
import { cn } from '@/lib/utils'

// Component to load and display Drive image thumbnail
function DriveThumbnail({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current || loading) return
    
    const loadThumbnail = async () => {
      setLoading(true)
      try {
        // Use Google's thumbnail API with size parameter
        const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200-h200`
        // Use electronAPI to bypass CORS
        const response = await window.electronAPI.downloadBlob(thumbUrl)
        if (response.ok && response.buffer) {
          const blob = new Blob([response.buffer], { type: response.contentType || 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
          loadedRef.current = true
        }
      } catch {
        // Silently fail - icon will show
      } finally {
        setLoading(false)
      }
    }

    loadThumbnail()
  }, [fileId])

  if (previewUrl) {
    return <img src={previewUrl} alt={fileName} className="h-full w-full object-cover" />
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-input">
      <ImageIcon size={32} className="text-text-muted opacity-50" />
    </div>
  )
}

interface DriveItem {
  id: string
  name: string
  mimeType: string
  kind: 'file' | 'folder'
  thumbnailLink?: string
  thumbnailUrl?: string
  webViewLink?: string
  size?: number
}

interface DriveListResponse {
  items: DriveItem[]
  nextPageToken?: string
  currentFolderId: string
  folderName?: string
}

interface BreadcrumbItem {
  id: string
  name: string
}

interface DriveUploadTabProps {
  projectId: number
  postType: PostType
  processedImages: { previewUrl: string }[]
  isProcessing: boolean
  onFilesSelected: (files: File[]) => void
}

export default function DriveUploadTab({
  projectId,
  postType,
  processedImages,
  isProcessing,
  onFilesSelected,
}: DriveUploadTabProps) {
  const [items, setItems] = useState<DriveItem[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isCarousel = postType === 'CAROUSEL'
  const maxImages = isCarousel ? MAX_CAROUSEL_IMAGES : 1
  const canSelectMore = isCarousel ? (processedImages.length + selectedIds.size < maxImages) : true

  const loadFiles = useCallback(async (folderId?: string, pageToken?: string, searchTerm?: string) => {
    const isMore = Boolean(pageToken)
    if (isMore) setIsLoadingMore(true)
    else { setIsLoading(true); setItems([]) }
    setError(null)

    try {
      const params = new URLSearchParams({ projectId: String(projectId), folder: 'images' })
      if (folderId) params.set('folderId', folderId)
      if (pageToken) params.set('pageToken', pageToken)
      if (searchTerm) params.set('search', searchTerm)

      const data = await api.get<DriveListResponse>(`/api/drive/list?${params}`)

      if (isMore) {
        setItems(prev => [...prev, ...data.items])
      } else {
        setItems(data.items)
        // Set root breadcrumb if first load
        if (!folderId && data.folderName && breadcrumbs.length === 0) {
          setBreadcrumbs([{ id: data.currentFolderId, name: data.folderName }])
        }
      }
      setNextPageToken(data.nextPageToken)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar arquivos'
      setError(msg)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [projectId, breadcrumbs.length])

  useEffect(() => {
    loadFiles()
  }, [projectId])

  const handleFolderClick = (folder: DriveItem) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
    loadFiles(folder.id)
  }

  const handleBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    setSearch('')
    loadFiles(crumb.id)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id
    loadFiles(currentFolderId, undefined, value || undefined)
  }

  const handleSelectImage = useCallback(async (item: DriveItem) => {
    if (isProcessing || downloadingId) return

    if (isCarousel) {
      if (selectedIds.has(item.id)) {
        setSelectedIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
        return
      }
      if (!canSelectMore) return
      setSelectedIds(prev => new Set(prev).add(item.id))

      setDownloadingId(item.id)
      try {
        const response = await window.electronAPI.apiRequest(
          `https://studio-lagosta-v2.vercel.app/api/google-drive-download`,
          {
            method: 'POST',
            body: JSON.stringify({ projectId, fileIds: [item.id] }),
            headers: { 'Content-Type': 'application/json' },
          }
        )
        if (!response.ok) throw new Error('Falha ao baixar arquivo')
        const data = response.data as { files: { id: string; name: string; url: string; pathname: string }[] }
        const fileData = data.files[0]
        if (!fileData) throw new Error('Arquivo não encontrado na resposta')
        // Use downloadBlob for binary data (avoids text conversion issues)
        const blobResponse = await window.electronAPI.downloadBlob(fileData.url)
        if (!blobResponse.ok || !blobResponse.buffer) {
          throw new Error('Falha ao baixar conteúdo: ' + (blobResponse.error || 'Unknown error'))
        }
        const buffer = blobResponse.buffer
        const file = new File([buffer], fileData.name, { type: item.mimeType })
        onFilesSelected([file])
      } catch {
        setSelectedIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
      } finally {
        setDownloadingId(null)
      }
    } else {
      setDownloadingId(item.id)
      try {
        const response = await window.electronAPI.apiRequest(
          `https://studio-lagosta-v2.vercel.app/api/google-drive-download`,
          {
            method: 'POST',
            body: JSON.stringify({ projectId, fileIds: [item.id] }),
            headers: { 'Content-Type': 'application/json' },
          }
        )
        if (!response.ok) throw new Error('Falha ao baixar arquivo')
        const data = response.data as { files: { id: string; name: string; url: string; pathname: string }[] }
        const fileData = data.files[0]
        if (!fileData) throw new Error('Arquivo não encontrado na resposta')
        const blobResponse = await window.electronAPI.downloadBlob(fileData.url)
        if (!blobResponse.ok || !blobResponse.buffer) throw new Error('Falha ao baixar conteúdo')
        const buffer = blobResponse.buffer
        const file = new File([buffer], fileData.name, { type: item.mimeType })
        onFilesSelected([file])
      } finally {
        setDownloadingId(null)
      }
    }
  }, [isProcessing, downloadingId, isCarousel, selectedIds, canSelectMore, projectId, onFilesSelected, processedImages.length])

  const imageItems = items.filter(i => i.kind === 'file' && i.mimeType.startsWith('image/'))
  const folderItems = items.filter(i => i.kind === 'folder')

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    const isNotConfigured = error.includes('não possui pasta') || error.includes('não configurado') || error.includes('503')
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-input">
          {isNotConfigured ? <FolderOpen size={24} className="text-text-muted" /> : <AlertCircle size={24} className="text-error" />}
        </div>
        <div>
          <p className="font-medium text-text">
            {isNotConfigured ? 'Google Drive não configurado' : 'Erro ao carregar'}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {isNotConfigured
              ? 'Configure uma pasta do Google Drive nas configurações do projeto'
              : error}
          </p>
        </div>
        {!isNotConfigured && (
          <button onClick={() => loadFiles()} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-input">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-text-muted overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight size={14} />}
              <button
                onClick={() => handleBreadcrumb(i)}
                className={cn(
                  'hover:text-text transition-colors',
                  i === breadcrumbs.length - 1 ? 'text-text font-medium' : 'hover:underline'
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar no Drive..."
          className="w-full rounded-lg border border-border bg-input py-2 pl-8 pr-3 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Folders */}
      {folderItems.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {folderItems.map(folder => (
            <button
              key={folder.id}
              onClick={() => handleFolderClick(folder)}
              className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-card transition-colors"
            >
              <FolderOpen size={16} className="shrink-0 text-primary" />
              <span className="truncate text-text">{folder.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Images */}
      {imageItems.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {imageItems.map(item => {
            const isSelected = selectedIds.has(item.id)
            const isDownloading = downloadingId === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleSelectImage(item)}
                disabled={isDownloading || (isCarousel && !isSelected && !canSelectMore)}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg bg-input transition-all',
                  isSelected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50',
                  (!canSelectMore && !isSelected && isCarousel) && 'opacity-40 cursor-not-allowed'
                )}
              >
                <DriveThumbnail fileId={item.id} fileName={item.name} />
                {isDownloading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    ✓
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="truncate text-xs text-white">{item.name}</p>
                </div>
              </button>
            )
          })}
        </div>
      ) : !isLoading && folderItems.length === 0 && (
        <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 text-center">
          <ImageIcon size={32} className="text-text-muted opacity-40" />
          <p className="text-sm text-text-muted">Nenhuma imagem nesta pasta</p>
        </div>
      )}

      {/* Load more */}
      {nextPageToken && (
        <button
          onClick={() => {
            const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id
            loadFiles(currentFolderId, nextPageToken, search || undefined)
          }}
          disabled={isLoadingMore}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm text-text-muted hover:bg-input"
        >
          {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
          Carregar mais
        </button>
      )}
    </div>
  )
}
