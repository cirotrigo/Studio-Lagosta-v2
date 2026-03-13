import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Shuffle, ImageOff } from 'lucide-react'
import { useProjectDesigns, getAspectRatioClass, type Design } from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface TemplateCarouselProps {
  projectId: number | undefined
  format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
  selectedDesignId: string | null
  onSelectDesign: (design: Design | null) => void
}

// Skeleton placeholder for loading state
function CarouselSkeleton({ format }: { format: string }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex-shrink-0 rounded-xl border-2 border-border bg-card/60 p-1.5"
        >
          <div
            className={cn(
              'w-[100px] animate-pulse rounded-lg bg-input/60',
              getAspectRatioClass(format as 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'),
            )}
          />
          <div className="mx-auto mt-1.5 h-3 w-16 animate-pulse rounded bg-input/60" />
        </div>
      ))}
    </div>
  )
}

// Thumbnail image with fade-in loading effect
function ThumbnailImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className={cn('relative', className)}>
      {/* Loading placeholder */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-input/40" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
          <ImageOff size={16} className="text-white/50" />
        </div>
      )}

      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

export function TemplateCarousel({
  projectId,
  format,
  selectedDesignId,
  onSelectDesign,
}: TemplateCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Fetch designs with tag "Template"
  const { data, isLoading } = useProjectDesigns(projectId, {
    tags: ['Template'],
    format,
  })

  const designs = useMemo(() => data?.designs ?? [], [data])

  // Check scroll state
  const updateScrollButtons = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10)
  }

  useEffect(() => {
    updateScrollButtons()
    window.addEventListener('resize', updateScrollButtons)
    return () => window.removeEventListener('resize', updateScrollButtons)
  }, [designs])

  // Auto-select random design when designs load and nothing selected
  useEffect(() => {
    if (designs.length > 0 && !selectedDesignId) {
      const randomIndex = Math.floor(Math.random() * designs.length)
      onSelectDesign(designs[randomIndex])
    }
  }, [designs, selectedDesignId, onSelectDesign])

  const scrollTo = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = 200
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
    setTimeout(updateScrollButtons, 300)
  }

  const handleRandomSelect = () => {
    if (designs.length === 0) return
    const randomIndex = Math.floor(Math.random() * designs.length)
    onSelectDesign(designs[randomIndex])

    // Scroll to selected
    if (scrollRef.current) {
      const cardWidth = 120 + 12 // width + gap
      scrollRef.current.scrollTo({
        left: randomIndex * cardWidth - scrollRef.current.clientWidth / 2 + cardWidth / 2,
        behavior: 'smooth',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-input/60" />
          <div className="h-6 w-20 animate-pulse rounded-lg bg-input/60" />
        </div>
        <CarouselSkeleton format={format} />
      </div>
    )
  }

  if (designs.length === 0) {
    const formatLabel = format === 'STORY' ? 'Stories' : format === 'SQUARE' ? 'Quadrado' : 'Feed'
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/30 p-5 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-input/60">
          <ImageOff size={18} className="text-text-subtle" />
        </div>
        <p className="text-sm font-medium text-text-muted">
          Nenhum template para {formatLabel}
        </p>
        <p className="mt-1.5 text-xs text-text-subtle">
          Adicione a tag "Template" aos designs no Editor para usa-los aqui
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text">
          Selecione um Template ({designs.length})
        </label>
        <button
          type="button"
          onClick={handleRandomSelect}
          className="group flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted transition-all hover:border-primary/40 hover:text-text hover:shadow-sm active:scale-95"
        >
          <Shuffle size={12} className="transition-transform group-hover:rotate-180" />
          Aleatorio
        </button>
      </div>

      <div className="relative">
        {/* Left scroll button */}
        <button
          type="button"
          onClick={() => scrollTo('left')}
          className={cn(
            'absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card border border-border shadow-lg transition-all duration-200',
            canScrollLeft
              ? 'opacity-100 hover:bg-input hover:scale-110'
              : 'pointer-events-none opacity-0',
          )}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Carousel */}
        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {designs.map((design) => {
            const isSelected = selectedDesignId === design.id
            return (
              <button
                key={design.id}
                type="button"
                onClick={() => onSelectDesign(design)}
                className={cn(
                  'group flex-shrink-0 rounded-xl border-2 p-1.5 transition-all duration-200',
                  isSelected
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 scale-[1.02]'
                    : 'border-border bg-card/60 hover:border-primary/40 hover:scale-[1.02] hover:shadow-lg',
                )}
              >
                {/* Thumbnail */}
                <div
                  className={cn(
                    'w-[100px] overflow-hidden rounded-lg bg-[#0f172a]',
                    getAspectRatioClass(design.format),
                  )}
                >
                  {design.thumbnail ? (
                    <ThumbnailImage
                      src={design.thumbnail}
                      alt={design.name}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
                      <span className="text-[8px] uppercase tracking-wider text-white/80">
                        Sem preview
                      </span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <p
                  className={cn(
                    'mt-1.5 w-[100px] truncate text-center text-[10px] font-medium transition-colors',
                    isSelected ? 'text-primary' : 'text-text group-hover:text-primary',
                  )}
                >
                  {design.name}
                </p>
              </button>
            )
          })}
        </div>

        {/* Right scroll button */}
        <button
          type="button"
          onClick={() => scrollTo('right')}
          className={cn(
            'absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card border border-border shadow-lg transition-all duration-200',
            canScrollRight
              ? 'opacity-100 hover:bg-input hover:scale-110'
              : 'pointer-events-none opacity-0',
          )}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Selected template info */}
      {selectedDesignId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-subtle">Selecionado:</span>
          <span className="font-medium text-primary">
            {designs.find((d) => d.id === selectedDesignId)?.name ?? 'Template'}
          </span>
        </div>
      )}
    </div>
  )
}
