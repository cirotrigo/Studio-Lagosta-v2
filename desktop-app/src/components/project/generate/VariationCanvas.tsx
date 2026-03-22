import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ResultImageCard } from '@/components/project/generate/ResultImageCard'
import { cn } from '@/lib/utils'
import type { GenerationVariationJob, ReviewField } from '@/stores/generation.store'
import type { ArtFormat } from '@/types/template'
import type { EditorFontSource } from '@/lib/editor/font-utils'

interface VariationCanvasProps {
  format: ArtFormat
  variations: GenerationVariationJob[]
  projectSlug?: string
  projectFonts?: EditorFontSource[]
  onDownload: (imageUrl: string) => void
  onSchedule: (imageUrl: string) => void
  onRemove: (variationId: string) => void
  onApprove: (variation: GenerationVariationJob) => void
  onOpenInEditor: (variation: GenerationVariationJob) => void
  onOpenArts: () => void
  onFieldsChange: (variationId: string, fields: ReviewField[]) => void
  onRegenerate: (variation: GenerationVariationJob) => void
}

export function VariationCanvas({
  format,
  variations,
  projectSlug,
  projectFonts,
  onDownload,
  onSchedule,
  onRemove,
  onApprove,
  onOpenInEditor,
  onOpenArts,
  onFieldsChange,
  onRegenerate,
}: VariationCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollRef.current
    if (!container) return
    const cardWidth = container.firstElementChild?.clientWidth ?? 400
    const scrollAmount = cardWidth + 16 // card width + gap
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (variations.length === 0) return null

  return (
    <div className="relative group">
      {/* Navigation arrows */}
      {variations.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-3 rounded-full border border-border bg-card/90 p-2 shadow-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
          >
            <ChevronLeft size={20} className="text-text" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-3 rounded-full border border-border bg-card/90 p-2 shadow-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
          >
            <ChevronRight size={20} className="text-text" />
          </button>
        </>
      )}

      {/* Scrollable canvas */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {variations.map((variation) => (
          <div
            key={variation.id}
            className={cn(
              'flex-shrink-0 snap-start',
              variations.length === 1 ? 'w-full' : 'w-[min(420px,85vw)]',
            )}
          >
            <ResultImageCard
              format={format}
              variation={variation}
              projectSlug={projectSlug}
              projectFonts={projectFonts}
              onDownload={() => variation.imageUrl && onDownload(variation.imageUrl)}
              onSchedule={() => variation.imageUrl && onSchedule(variation.imageUrl)}
              onRemove={() => onRemove(variation.id)}
              onApprove={() => onApprove(variation)}
              onOpenInEditor={() => onOpenInEditor(variation)}
              onOpenArts={onOpenArts}
              onFieldsChange={(fields: ReviewField[]) => onFieldsChange(variation.id, fields)}
              onRegenerate={() => onRegenerate(variation)}
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {variations.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          {variations.map((v) => (
            <div
              key={v.id}
              className={cn(
                'h-1.5 rounded-full transition-all',
                v.status === 'ready' ? 'w-3 bg-emerald-400' :
                v.status === 'error' ? 'w-3 bg-red-400' :
                v.status === 'processing' ? 'w-3 bg-primary animate-pulse' :
                'w-1.5 bg-text-muted/30',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
