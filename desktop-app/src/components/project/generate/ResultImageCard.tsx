import { useState } from 'react'
import { Download, Calendar, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArtFormat } from '@/stores/generation.store'

interface ResultImageCardProps {
  imageUrl: string
  format: ArtFormat
  onDownload: () => void
  onSchedule: () => void
  onDiscard: () => void
}

export default function ResultImageCard({
  imageUrl,
  format,
  onDownload,
  onSchedule,
  onDiscard,
}: ResultImageCardProps) {
  const [naturalAspect, setNaturalAspect] = useState<string | null>(null)

  const getAspectRatio = () => {
    switch (format) {
      case 'STORY':
        return '9 / 16'
      case 'SQUARE':
        return '1 / 1'
      default:
        return '4 / 5'
    }
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card')}>
      <div className="relative" style={{ aspectRatio: naturalAspect || getAspectRatio() }}>
        <img
          src={imageUrl}
          alt="Arte gerada"
          className="h-full w-full object-contain bg-zinc-950"
          onLoad={(event) => {
            const img = event.currentTarget
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setNaturalAspect(`${img.naturalWidth} / ${img.naturalHeight}`)
            }
          }}
        />

        <div className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          {format === 'FEED_PORTRAIT' ? 'Feed' : format === 'STORY' ? 'Story' : 'Quadrado'}
        </div>
      </div>

      <div className="space-y-2 border-t border-border/70 bg-card/95 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onDownload}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-input/70 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-input"
          >
            <Download size={14} />
            Baixar
          </button>
          <button
            onClick={onSchedule}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Calendar size={14} />
            Agendar
          </button>
        </div>
        <button
          onClick={onDiscard}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-error/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-error"
        >
          <Trash2 size={12} />
          Descartar
        </button>
      </div>
    </div>
  )
}
