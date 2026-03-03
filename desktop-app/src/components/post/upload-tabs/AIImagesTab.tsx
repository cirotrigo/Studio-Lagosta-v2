import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Image as ImageIcon, Search, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { PostType, MAX_CAROUSEL_IMAGES } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface AIImage {
  id: string
  name: string
  fileUrl: string
  prompt: string
  createdAt: string
}

interface AIImagesTabProps {
  projectId: number
  postType: PostType
  processedImages: { previewUrl: string }[]
  isProcessing: boolean
  onFilesSelected: (files: File[]) => void
}

export default function AIImagesTab({
  projectId,
  postType,
  processedImages,
  isProcessing,
  onFilesSelected,
}: AIImagesTabProps) {
  const [images, setImages] = useState<AIImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isCarousel = postType === 'CAROUSEL'
  const maxImages = isCarousel ? MAX_CAROUSEL_IMAGES : 1
  // For carousel: can add more if within limit. For single: always allow (replaces current)
  const canSelectMore = isCarousel ? (processedImages.length + selectedIds.size < maxImages) : true

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await api.get<AIImage[]>(`/api/projects/${projectId}/ai-images`)
        setImages(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar imagens')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [projectId])

  const filtered = search
    ? images.filter(img =>
        img.name.toLowerCase().includes(search.toLowerCase()) ||
        img.prompt.toLowerCase().includes(search.toLowerCase())
      )
    : images

  const handleSelect = useCallback(async (image: AIImage) => {
    if (isProcessing || downloadingId) return

    if (isCarousel) {
      if (selectedIds.has(image.id)) {
        setSelectedIds(prev => { const s = new Set(prev); s.delete(image.id); return s })
        return
      }
      if (!canSelectMore) return
      setSelectedIds(prev => new Set(prev).add(image.id))
    }

    setDownloadingId(image.id)
    try {
      // Vercel Blob URLs are public — use native fetch
      const response = await fetch(image.fileUrl)
      if (!response.ok) throw new Error('Falha ao baixar imagem')
      const buffer = await response.arrayBuffer()
      const ext = image.fileUrl.split('.').pop()?.toLowerCase() || 'png'
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
      const mime = mimeMap[ext] || 'image/png'
      const fileName = `ai-${image.id}.${ext}`
      const file = new File([buffer], fileName, { type: mime })
      onFilesSelected([file])
    } catch {
      if (isCarousel) {
        setSelectedIds(prev => { const s = new Set(prev); s.delete(image.id); return s })
      }
    } finally {
      setDownloadingId(null)
    }
  }, [isProcessing, downloadingId, isCarousel, selectedIds, canSelectMore, onFilesSelected])

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle size={32} className="text-error" />
        <p className="text-sm text-text-muted">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por prompt ou nome..."
          className="w-full rounded-lg border border-border bg-input py-2 pl-8 pr-3 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 text-center">
          <Sparkles size={32} className="text-text-muted opacity-40" />
          <p className="text-sm text-text-muted">
            {search ? 'Nenhuma imagem encontrada' : 'Nenhuma imagem IA gerada ainda'}
          </p>
          {!search && (
            <p className="text-xs text-text-subtle">Gere imagens com IA no Studio para que apareçam aqui</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {filtered.map(image => {
            const isSelected = selectedIds.has(image.id)
            const isDownloading = downloadingId === image.id
            return (
              <button
                key={image.id}
                onClick={() => handleSelect(image)}
                disabled={isDownloading || (isCarousel && !isSelected && !canSelectMore)}
                title={image.prompt}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg bg-input transition-all',
                  isSelected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50',
                  (!canSelectMore && !isSelected && isCarousel) && 'opacity-40 cursor-not-allowed'
                )}
              >
                <img src={image.fileUrl} alt={image.name} className="h-full w-full object-cover" />
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
                  <p className="truncate text-xs text-white">{image.prompt}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {isCarousel && selectedIds.size > 0 && (
        <p className="text-xs text-text-muted text-center">
          {selectedIds.size} selecionada(s) • {processedImages.length + selectedIds.size}/{maxImages} total
        </p>
      )}
    </div>
  )
}
