import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Edit3, ImageOff, Plus, Settings2, Tag, Trash2, X } from 'lucide-react'
import { useProjectDesigns, getAspectRatioClass, type Design, type DesignFormat } from '@/hooks/use-project-designs'
import { useTagsStore } from '@/stores/tags.store'
import { cn } from '@/lib/utils'

interface EditorTemplateCarouselProps {
  projectId: number | undefined
  selectedDesignId: string | null
  onSelectDesign: (design: Design) => void
  onCreateNew: () => void
  onDeleteDesign: (design: Design) => void
  onManageTags?: (design: Design) => void
  onManageProjectTags?: () => void
}

const FORMAT_OPTIONS: { value: DesignFormat | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'STORY', label: 'Story' },
  { value: 'FEED_PORTRAIT', label: 'Feed' },
  { value: 'SQUARE', label: 'Quadrado' },
]

// Skeleton placeholder for loading state
function CarouselSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex-shrink-0 rounded-xl border border-white/5 bg-white/5 p-1.5"
        >
          <div className="aspect-[9/16] w-[80px] animate-pulse rounded-lg bg-white/10" />
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
  onManageTags,
  onManageProjectTags,
}: EditorTemplateCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [hoveredDesignId, setHoveredDesignId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedFormat, setSelectedFormat] = useState<DesignFormat | 'ALL'>('ALL')

  // Get project tags from store
  const projectTags = useTagsStore((state) => state.tags)

  // Fetch all designs for the project
  const { data, isLoading } = useProjectDesigns(projectId, {
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    format: selectedFormat !== 'ALL' ? selectedFormat : undefined,
  })

  const designs = data?.designs ?? []

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const clearFilters = () => {
    setSelectedTags([])
    setSelectedFormat('ALL')
  }

  const hasFilters = selectedTags.length > 0 || selectedFormat !== 'ALL'

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
      <div className="panel-glass rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded bg-white/10" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-white/10" />
        </div>
        <CarouselSkeleton />
      </div>
    )
  }

  return (
    <div className="panel-glass rounded-2xl p-4 relative overflow-hidden group/carousel">
      {/* Glow Backing */}
      <div className="absolute -inset-4 bg-orange-500/5 blur-2xl -z-10 opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-700 pointer-events-none" />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
          Templates <span className="flex items-center justify-center bg-white/10 text-white/70 text-[10px] rounded-full h-5 px-2">{designs.length}</span>
        </h2>
        <button
          type="button"
          onClick={onCreateNew}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition-all hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        >
          <Plus size={14} className="group-hover:rotate-90 transition-transform duration-300" />
          Novo Template
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Format filter */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-1 shadow-inner">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedFormat(option.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-300',
                selectedFormat === option.value
                  ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md'
                  : 'text-white/40 hover:bg-white/10 hover:text-white/80',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Tag chips */}
        <div className="flex flex-wrap items-center gap-1">
          {projectTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.name)}
              className={cn(
                'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all duration-300',
                selectedTags.includes(tag.name)
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(234,88,12,0.1)]'
                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/80 hover:border-white/20',
              )}
              style={{
                backgroundColor: selectedTags.includes(tag.name) && tag.color ? tag.color : undefined,
              }}
            >
              {tag.name}
            </button>
          ))}
          {onManageProjectTags && (
            <button
              type="button"
              onClick={onManageProjectTags}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40 transition-all duration-300 hover:bg-white/10 hover:text-white/80"
              title="Gerenciar tags do projeto"
            >
              <Settings2 size={12} />
              Tags
            </button>
          )}
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 transition-all duration-300 hover:bg-red-500/20 hover:text-red-300 ml-2"
          >
            <X size={12} />
            Limpar
          </button>
        )}
      </div>

      {designs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5 border border-white/10">
            <ImageOff size={24} className="text-white/20" />
          </div>
          <p className="text-sm font-semibold text-white/60 tracking-wide uppercase">
            Nenhum template encontrado
          </p>
          <p className="mt-1.5 text-xs text-white/40">
            Crie seu primeiro template clicando no botão novo template
          </p>
        </div>
      ) : (
        <div className="relative group/scroll">
          {/* Left scroll button */}
          <button
            type="button"
            onClick={() => scrollTo('left')}
            className={cn(
              'absolute -left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/80 backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300',
              canScrollLeft
                ? 'opacity-0 group-hover/scroll:opacity-100 hover:bg-white/10 hover:border-white/20 hover:scale-110 text-white'
                : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft size={18} />
          </button>

          {/* Carousel */}
          <div
            ref={scrollRef}
            onScroll={updateScrollButtons}
            className="flex gap-4 overflow-x-auto px-2 pb-2 scrollbar-hide pt-1"
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
                    'group relative flex-shrink-0 rounded-[14px] p-2 transition-all duration-300 ring-1 outline-none',
                    isSelected
                      ? 'bg-white/10 ring-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.15)] scale-[1.03] z-10'
                      : 'bg-[#121212]/50 ring-white/5 hover:ring-white/20 hover:scale-[1.02] hover:bg-[#1a1a1a]/80 shadow-lg',
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

                    {/* Action buttons on hover */}
                    {isHovered && (
                      <div
                        className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 backdrop-blur-[2px] transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectDesign(design)
                          }}
                          className="rounded-lg bg-white/20 p-1.5 text-white transition-all hover:bg-white/30 hover:scale-110"
                          title="Editar"
                        >
                          <Edit3 size={12} />
                        </button>
                        {onManageTags && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onManageTags(design)
                            }}
                            className="rounded-lg bg-white/20 p-1.5 text-white transition-all hover:bg-white/30 hover:scale-110"
                            title="Gerenciar tags"
                          >
                            <Tag size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, design)}
                          className="rounded-lg bg-red-500/30 p-1.5 text-red-300 transition-all hover:bg-red-500/50 hover:scale-110"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}

                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-orange-600/90 to-orange-500/80 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-white shadow-[0_-4px_10px_rgba(234,88,12,0.3)]">
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
              'absolute -right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/80 backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300',
              canScrollRight
                ? 'opacity-0 group-hover/scroll:opacity-100 hover:bg-white/10 hover:border-white/20 hover:scale-110 text-white'
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
