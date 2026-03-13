import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react'
import { useProjectDesigns, getAspectRatioClass, type Design } from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface TemplateCarouselProps {
  projectId: number | undefined
  format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
  selectedDesignId: string | null
  onSelectDesign: (design: Design | null) => void
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
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (designs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-4 text-center">
        <p className="text-sm text-text-muted">
          Nenhum template com tag "Template" encontrado para {format}
        </p>
        <p className="mt-1 text-xs text-text-subtle">
          Adicione a tag "Template" aos designs que deseja usar aqui
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
          className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:border-primary/40 hover:text-text"
        >
          <Shuffle size={12} />
          Aleatorio
        </button>
      </div>

      <div className="relative">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollTo('left')}
            className="absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card border border-border shadow-lg hover:bg-input"
          >
            <ChevronLeft size={16} />
          </button>
        )}

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
                  'flex-shrink-0 rounded-xl border-2 p-1.5 transition-all',
                  isSelected
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                    : 'border-border bg-card/60 hover:border-primary/40',
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
                    <img
                      src={design.thumbnail}
                      alt={design.name}
                      className="h-full w-full object-cover"
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
                <p className="mt-1.5 w-[100px] truncate text-center text-[10px] font-medium text-text">
                  {design.name}
                </p>
              </button>
            )
          })}
        </div>

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollTo('right')}
            className="absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card border border-border shadow-lg hover:bg-input"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Selected template info */}
      {selectedDesignId && (
        <p className="text-xs text-text-muted">
          Selecionado: {designs.find((d) => d.id === selectedDesignId)?.name ?? 'Template'}
        </p>
      )}
    </div>
  )
}
