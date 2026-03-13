import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, Plus, Trash2 } from 'lucide-react'
import { useProjectDesigns, getAspectRatioClass, type Design } from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface EditorTemplateCarouselProps {
  projectId: number | undefined
  selectedDesignId: string | null
  onSelectDesign: (design: Design) => void
  onCreateNew: () => void
  onDeleteDesign: (design: Design) => void
}

// Skeleton placeholder for loading state
function CarouselSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex-shrink-0 rounded-xl border border-border bg-card/60 p-1.5"
        >
          <div className="aspect-[9/16] w-[80px] animate-pulse rounded-lg bg-input/40" />
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
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-input/40 rounded-lg" />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
          <ImageOff size={14} className="text-white/50" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          'h-full w-full object-cover rounded-lg transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

export function EditorTemplateCarousel({
  projectId,
  selectedDesignId,
  onSelectDesign,
  onCreateNew,
  onDeleteDesign,
}: EditorTemplateCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [hoveredDesignId, setHoveredDesignId] = useState<string | null>(null)

  // Fetch all designs for the project
  const { data, isLoading } = useProjectDesigns(projectId)

  const designs = data?.designs ?? []

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

  const scrollTo = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const scrollAmount = 200
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
    setTimeout(updateScrollButtons, 300)
  }

  const handleDelete = (e: React.MouseEvent, design: Design) => {
    e.stopPropagation()
    onDeleteDesign(design)
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded bg-input/40" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-input/40" />
        </div>
        <CarouselSkeleton />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">
          Templates ({designs.length})
        </h2>
        <button
          type="button"
          onClick={onCreateNew}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <Plus size={14} />
          Novo Template
        </button>
      </div>

      {designs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-input/40">
            <ImageOff size={20} className="text-text-subtle" />
          </div>
          <p className="text-sm font-medium text-text-muted">
            Nenhum template encontrado
          </p>
          <p className="mt-1 text-xs text-text-subtle">
            Crie seu primeiro template clicando no botao acima
          </p>
        </div>
      ) : (
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
            className="flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {designs.map((design) => {
              const isSelected = selectedDesignId === design.id
              const isHovered = hoveredDesignId === design.id

              return (
                <button
                  key={design.id}
                  type="button"
                  onClick={() => onSelectDesign(design)}
                  onMouseEnter={() => setHoveredDesignId(design.id)}
                  onMouseLeave={() => setHoveredDesignId(null)}
                  className={cn(
                    'group relative flex-shrink-0 rounded-xl border-2 p-1.5 transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 scale-[1.02]'
                      : 'border-border bg-card/60 hover:border-primary/40 hover:scale-[1.02] hover:shadow-lg',
                  )}
                >
                  {/* Thumbnail */}
                  <div
                    className={cn(
                      'relative w-[80px] overflow-hidden rounded-lg bg-[#0f172a]',
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
                        <span className="text-[7px] uppercase tracking-wider text-white/80">
                          Sem preview
                        </span>
                      </div>
                    )}

                    {/* Delete button on hover */}
                    {isHovered && !isSelected && (
                      <div
                        className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, design)}
                          className="rounded-lg bg-red-500/20 p-2 text-red-400 transition-all hover:bg-red-500/40 hover:scale-110"
                          title="Excluir template"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}

                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[8px] font-medium text-white">
                        Editando
                      </div>
                    )}
                  </div>
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
      )}
    </div>
  )
}
