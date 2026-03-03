import { useState, useEffect, useCallback } from 'react'
import { Loader2, Layers, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { PostType, MAX_CAROUSEL_IMAGES } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Generation {
  id: string
  status: string
  resultUrl?: string | null
  thumbnailUrl?: string | null
  templateName?: string | null
  createdAt: string
  Template?: { name: string; dimensions?: string } | null
}

interface GenerationsResponse {
  generations: Generation[]
  pagination: { total: number; totalPages: number }
}

interface CreativesTabProps {
  projectId: number
  postType: PostType
  processedImages: { previewUrl: string }[]
  isProcessing: boolean
  onFilesSelected: (files: File[]) => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function CreativesTab({
  projectId,
  postType,
  processedImages,
  isProcessing,
  onFilesSelected,
}: CreativesTabProps) {
  const [creatives, setCreatives] = useState<Generation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isCarousel = postType === 'CAROUSEL'
  const maxImages = isCarousel ? MAX_CAROUSEL_IMAGES : 1
  const canSelectMore = isCarousel ? (processedImages.length + selectedIds.size < maxImages) : true

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await api.get<GenerationsResponse>(
          `/api/projects/${projectId}/generations?pageSize=60`
        )
        // Only show completed with resultUrl
        const completed = data.generations.filter(
          g => g.status === 'COMPLETED' && g.resultUrl
        )
        setCreatives(completed)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar criativos')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [projectId])

  const handleSelect = useCallback(async (creative: Generation) => {
    if (isProcessing || downloadingId || !creative.resultUrl) return

    if (isCarousel) {
      if (selectedIds.has(creative.id)) {
        setSelectedIds(prev => { const s = new Set(prev); s.delete(creative.id); return s })
        return
      }
      if (!canSelectMore) return
      setSelectedIds(prev => new Set(prev).add(creative.id))
    }

    setDownloadingId(creative.id)
    try {
      const response = await fetch(creative.resultUrl)
      if (!response.ok) throw new Error('Falha ao baixar criativo')
      const buffer = await response.arrayBuffer()
      const url = creative.resultUrl
      const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'png'
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
      const mime = mimeMap[ext] || 'image/png'
      const fileName = `criativo-${creative.id}.${ext}`
      const file = new File([buffer], fileName, { type: mime })
      onFilesSelected([file])
    } catch {
      if (isCarousel) {
        setSelectedIds(prev => { const s = new Set(prev); s.delete(creative.id); return s })
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

  if (creatives.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center p-6">
        <Layers size={32} className="text-text-muted opacity-40" />
        <p className="text-sm text-text-muted">Nenhum criativo gerado ainda</p>
        <p className="text-xs text-text-subtle">Crie criativos no Studio para que apareçam aqui</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {creatives.map(creative => {
          const isSelected = selectedIds.has(creative.id)
          const isDownloading = downloadingId === creative.id
          const thumb = creative.thumbnailUrl || creative.resultUrl
          const label = creative.Template?.name || creative.templateName || 'Criativo'

          return (
            <button
              key={creative.id}
              onClick={() => handleSelect(creative)}
              disabled={isDownloading || (isCarousel && !isSelected && !canSelectMore)}
              title={label}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-lg bg-input transition-all',
                isSelected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50',
                (!canSelectMore && !isSelected && isCarousel) && 'opacity-40 cursor-not-allowed'
              )}
            >
              {thumb ? (
                <img src={thumb} alt={label} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageIcon size={24} className="text-text-muted" />
                </div>
              )}
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
                <p className="truncate text-xs text-white">{label}</p>
                <p className="text-xs text-white/70">{formatDate(creative.createdAt)}</p>
              </div>
            </button>
          )
        })}
      </div>

      {isCarousel && selectedIds.size > 0 && (
        <p className="text-xs text-text-muted text-center">
          {selectedIds.size} selecionado(s) • {processedImages.length + selectedIds.size}/{maxImages} total
        </p>
      )}
    </div>
  )
}
