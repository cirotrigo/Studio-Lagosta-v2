import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Search,
  RefreshCw,
  FolderOpen,
  Image as ImageIcon,
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import type { DriveFile, ReferenceImage } from '@/lib/queue/types'
import { useDriveCache } from '../hooks/useDriveCache'

interface DriveListResponse {
  items: DriveFile[]
  nextPageToken?: string
  currentFolderId: string
  folderName?: string
}

interface BreadcrumbItem {
  id: string
  name: string
}

interface DriveImagePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (images: ReferenceImage[]) => void
  projectId: number
  maxImages: number
  selectedCount: number
}

function DriveThumbnail({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current || loading) return

    const loadThumbnail = async () => {
      setLoading(true)
      try {
        const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200-h200`
        const response = await window.electronAPI.downloadBlob(thumbUrl)
        if (response.ok && response.buffer) {
          const blob = new Blob([response.buffer], {
            type: response.contentType || 'image/jpeg',
          })
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
          loadedRef.current = true
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    loadThumbnail()
  }, [fileId])

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
        <Loader2 size={20} className="animate-spin text-white/30" />
      </div>
    )
  }

  if (previewUrl) {
    return <img src={previewUrl} alt={fileName} className="h-full w-full object-cover" />
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
      <ImageIcon size={24} className="text-white/30" />
    </div>
  )
}

export default function DriveImagePicker({
  isOpen,
  onClose,
  onSelect,
  projectId,
  maxImages,
  selectedCount,
}: DriveImagePickerProps) {
  const [items, setItems] = useState<DriveFile[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { isRefreshing, lastRefreshedLabel, refreshFolder } = useDriveCache({
    projectId,
  })

  const canSelectMore = selectedCount + selectedIds.size < maxImages

  const loadFiles = useCallback(
    async (folderId?: string) => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          projectId: String(projectId),
          folder: 'images',
        })
        if (folderId) params.set('folderId', folderId)
        if (search) params.set('search', search)

        const data = await api.get<DriveListResponse>(`/api/drive/list?${params}`)

        setItems(data.items)

        if (!folderId && data.folderName && breadcrumbs.length === 0) {
          setBreadcrumbs([{ id: data.currentFolderId, name: data.folderName }])
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar arquivos'
        setError(msg)
      } finally {
        setIsLoading(false)
      }
    },
    [projectId, search, breadcrumbs.length]
  )

  const handleRefresh = useCallback(async () => {
    const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id
    if (currentFolderId) {
      await refreshFolder(currentFolderId)
    }
    await loadFiles(currentFolderId)
  }, [breadcrumbs, refreshFolder, loadFiles])

  const handleFolderClick = (folder: DriveFile) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
    loadFiles(folder.id)
  }

  const handleBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs((prev) => prev.slice(0, index + 1))
    setSearch('')
    loadFiles(crumb.id)
  }

  const handleToggleSelect = (file: DriveFile) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(file.id)) {
        next.delete(file.id)
      } else if (canSelectMore || prev.has(file.id)) {
        next.add(file.id)
      }
      return next
    })
  }

  const handleImport = () => {
    const selectedFiles = items.filter((i) => selectedIds.has(i.id))
    const images: ReferenceImage[] = selectedFiles.map((file) => ({
      id: file.id,
      url: `/api/google-drive/image/${file.id}`,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w200-h200`,
      source: 'drive' as const,
      driveFileId: file.id,
      name: file.name,
      addedAt: new Date().toISOString(),
    }))

    onSelect(images)
    setSelectedIds(new Set())
    onClose()
  }

  useEffect(() => {
    if (isOpen) {
      loadFiles()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set())
      setSearch('')
    }
  }, [isOpen])

  const imageItems = items.filter(
    (i) => i.kind === 'file' && i.mimeType.startsWith('image/')
  )
  const folderItems = items.filter((i) => i.kind === 'folder')

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
            <h2 className="text-lg font-semibold text-white">
              Selecionar do Google Drive
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <X size={18} className="text-white/70" />
            </button>
          </div>

          {/* Search & Refresh */}
          <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadFiles(breadcrumbs[breadcrumbs.length - 1]?.id)
                  }
                }}
                placeholder="Buscar imagens..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl',
                'bg-white/[0.03] border border-white/[0.08]',
                'text-white/70 hover:bg-white/[0.06] transition-colors',
                'disabled:opacity-50'
              )}
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              <span className="text-sm">Atualizar</span>
            </button>
          </div>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 px-4 py-2 text-sm text-white/50 overflow-x-auto border-b border-white/[0.06]">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.id} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <ChevronRight size={14} />}
                  <button
                    onClick={() => handleBreadcrumb(i)}
                    className={cn(
                      'hover:text-white transition-colors',
                      i === breadcrumbs.length - 1
                        ? 'text-white font-medium'
                        : 'hover:underline'
                    )}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Last Refresh Info */}
          {lastRefreshedLabel && (
            <div className="px-4 py-1 text-xs text-white/40">
              Ultima atualizacao: {lastRefreshedLabel}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={28} className="animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm text-white/70">{error}</p>
                <button
                  onClick={() => loadFiles()}
                  className="px-4 py-2 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Folders */}
                {folderItems.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {folderItems.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleFolderClick(folder)}
                        className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors text-left"
                      >
                        <FolderOpen size={18} className="text-primary shrink-0" />
                        <span className="text-sm text-white truncate">
                          {folder.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Images */}
                {imageItems.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {imageItems.map((item) => {
                      const isSelected = selectedIds.has(item.id)
                      const canSelect = canSelectMore || isSelected

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleToggleSelect(item)}
                          disabled={!canSelect}
                          className={cn(
                            'relative aspect-square rounded-xl overflow-hidden',
                            'border-2 transition-all duration-200',
                            isSelected
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-transparent hover:border-white/20',
                            !canSelect && 'opacity-40 cursor-not-allowed'
                          )}
                        >
                          <DriveThumbnail fileId={item.id} fileName={item.name} />

                          {/* Selection Indicator */}
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check size={14} className="text-white" />
                            </div>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
                            <p className="absolute bottom-2 left-2 right-2 text-xs text-white truncate">
                              {item.name}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : !isLoading && folderItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <ImageIcon size={32} className="text-white/30" />
                    <p className="text-sm text-white/50">
                      Nenhuma imagem nesta pasta
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-white/[0.06] bg-white/[0.02]">
            <div className="text-sm text-white/50">
              {selectedIds.size > 0 ? (
                <span>
                  {selectedIds.size} imagem{selectedIds.size > 1 ? 'ns' : ''}{' '}
                  selecionada{selectedIds.size > 1 ? 's' : ''}
                </span>
              ) : (
                <span>
                  Selecione ate {maxImages - selectedCount} imagem
                  {maxImages - selectedCount > 1 ? 'ns' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-xl text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={selectedIds.size === 0}
                className={cn(
                  'px-4 py-2 text-sm rounded-xl font-medium transition-all',
                  'bg-primary hover:bg-primary/90 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Importar
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
