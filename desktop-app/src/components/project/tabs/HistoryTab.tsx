import { useState, useMemo } from 'react'
import { Download, Loader2, Image as ImageIcon, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAIImages, AIImage } from '@/hooks/use-art-generation'
import { cn } from '@/lib/utils'
import { ArtFormat } from '@/stores/generation.store'
import { ReeditDraft } from '@/types/art-automation'

interface HistoryTabProps {
  projectId: number
  onReedit?: (draft: ReeditDraft) => void
}

type FilterFormat = 'ALL' | ArtFormat
type FilterPeriod = 'ALL' | '7D' | '30D' | '90D'

const FORMAT_OPTIONS: { value: FilterFormat; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'FEED_PORTRAIT', label: 'Feed' },
  { value: 'STORY', label: 'Story' },
  { value: 'SQUARE', label: 'Quadrado' },
]

const PERIOD_OPTIONS: { value: FilterPeriod; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: '7D', label: '7 dias' },
  { value: '30D', label: '30 dias' },
  { value: '90D', label: '90 dias' },
]

export default function HistoryTab({ projectId, onReedit }: HistoryTabProps) {
  const { data: images, isLoading, error } = useAIImages(projectId)
  const [filterFormat, setFilterFormat] = useState<FilterFormat>('ALL')
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('ALL')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const filteredImages = useMemo(() => {
    if (!images) return []

    let result = [...images]

    // Filter by format
    if (filterFormat !== 'ALL') {
      result = result.filter((img) => img.format === filterFormat)
    }

    // Filter by period
    if (filterPeriod !== 'ALL') {
      const now = new Date()
      const days = filterPeriod === '7D' ? 7 : filterPeriod === '30D' ? 30 : 90
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      result = result.filter((img) => new Date(img.createdAt) >= cutoff)
    }

    // Sort by date descending
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return result
  }, [images, filterFormat, filterPeriod])

  const handleDownload = async (image: AIImage) => {
    setDownloadingId(image.id)
    try {
      const response = await window.electronAPI.downloadBlob(image.fileUrl)
      if (!response.ok || !response.buffer) {
        throw new Error('Erro ao baixar imagem')
      }

      const blob = new Blob([response.buffer], { type: response.contentType || 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = image.name || `arte-${image.id}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Imagem baixada!')
    } catch (error) {
      toast.error('Erro ao baixar imagem')
    } finally {
      setDownloadingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const getAspectClass = (format?: string) => {
    switch (format) {
      case 'STORY':
        return 'aspect-[9/16]'
      case 'SQUARE':
        return 'aspect-square'
      default:
        return 'aspect-[4/5]'
    }
  }

  const inferFormat = (image: AIImage): ArtFormat => {
    if (image.format === 'STORY' || image.aspectRatio === '9:16') return 'STORY'
    if (image.format === 'SQUARE' || image.aspectRatio === '1:1') return 'SQUARE'
    return 'FEED_PORTRAIT'
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-text-muted">Erro ao carregar historico</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          {/* Format Filter */}
          <div className="flex gap-1 rounded-lg border border-border bg-input p-1">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterFormat(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  filterFormat === opt.value
                    ? 'bg-card text-text'
                    : 'text-text-muted hover:text-text'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Period Filter */}
          <div className="flex gap-1 rounded-lg border border-border bg-input p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterPeriod(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  filterPeriod === opt.value
                    ? 'bg-card text-text'
                    : 'text-text-muted hover:text-text'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-card">
              <ImageIcon size={32} className="text-text-subtle" />
            </div>
            <h3 className="text-lg font-medium text-text">Nenhuma arte encontrada</h3>
            <p className="mt-2 text-sm text-text-muted">
              {images?.length === 0
                ? 'Comece gerando artes na aba "Gerar Arte"'
                : 'Tente ajustar os filtros'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {filteredImages.map((image) => (
              <div
                key={image.id}
                className={cn(
                  'group relative overflow-hidden rounded-xl border border-border bg-card',
                  getAspectClass(image.format)
                )}
              >
                <img
                  src={image.fileUrl}
                  alt={image.name}
                  className="h-full w-full object-contain bg-zinc-950"
                />

                {/* Hover Overlay */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="p-3">
                    <p className="text-xs text-white/80">{formatDate(image.createdAt)}</p>
                    {image.format && (
                      <span className="mt-1 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
                        {image.format === 'FEED_PORTRAIT' ? 'Feed' : image.format === 'STORY' ? 'Story' : 'Quadrado'}
                      </span>
                    )}
                    <button
                      onClick={() => handleDownload(image)}
                      disabled={downloadingId === image.id}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/30"
                    >
                      {downloadingId === image.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Baixar
                    </button>
                    {onReedit && (
                      <button
                        onClick={() => {
                          onReedit({
                            sourceArtId: image.id,
                            prompt: image.prompt || '',
                            format: inferFormat(image),
                            photoUrl: image.fileUrl,
                            photoSource: 'history',
                          })
                          toast.success('Arte carregada para reedição')
                        }}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/80 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary"
                      >
                        <Wand2 size={14} />
                        Reeditar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
