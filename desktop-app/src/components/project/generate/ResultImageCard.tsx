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
  const getAspectClass = () => {
    switch (format) {
      case 'STORY':
        return 'aspect-[9/16]'
      case 'SQUARE':
        return 'aspect-square'
      default:
        return 'aspect-[4/5]'
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card',
        getAspectClass()
      )}
    >
      {/* Image */}
      <img
        src={imageUrl}
        alt="Arte gerada"
        className="h-full w-full object-contain bg-zinc-950"
      />

      {/* Hover Overlay */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="space-y-2 p-3">
          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onDownload}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 px-3 py-2 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/30"
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
          <div className="flex gap-2">
            <button
              onClick={onDiscard}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-error/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-error/30"
            >
              <Trash2 size={12} />
              Descartar
            </button>
          </div>
        </div>
      </div>

      {/* Format Badge */}
      <div className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {format === 'FEED_PORTRAIT' ? 'Feed' : format === 'STORY' ? 'Story' : 'Quadrado'}
      </div>
    </div>
  )
}
