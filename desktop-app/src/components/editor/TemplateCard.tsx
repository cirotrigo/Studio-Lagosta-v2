import { useState } from 'react'
import { Copy, Edit3, ImageOff, Tag, Trash2 } from 'lucide-react'
import { useTagsStore } from '@/stores/tags.store'
import { getAspectRatioClass, type Design } from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface TemplateCardProps {
  design: Design
  onSelect?: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onManageTags?: () => void
}

// Thumbnail with loading state
function CardThumbnail({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <>
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-input/40" />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
          <ImageOff size={20} className="text-white/50" />
        </div>
      )}
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
    </>
  )
}

export function TemplateCard({
  design,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onManageTags,
}: TemplateCardProps) {
  const projectTags = useTagsStore((state) => state.tags)
  const [isHovered, setIsHovered] = useState(false)

  // Helper to get tag color
  const getTagColor = (tagName: string): string => {
    const tag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280'
  }

  const handleClick = () => {
    onSelect?.()
  }

  const handleAction = (
    e: React.MouseEvent,
    action: (() => void) | undefined,
  ) => {
    e.stopPropagation()
    action?.()
  }

  return (
    <div
      className="group relative rounded-xl border border-border bg-card/60 p-2 text-left transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:scale-[1.02]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Clickable area for selection */}
      <button
        type="button"
        onClick={handleClick}
        className="w-full text-left"
      >
        {/* Thumbnail with proper aspect ratio */}
        <div
          className={cn(
            'relative overflow-hidden rounded-lg border border-border bg-[#0f172a]',
            getAspectRatioClass(design.format),
          )}
        >
          {design.thumbnail ? (
            <CardThumbnail src={design.thumbnail} alt={design.name} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/80">
                Sem preview
              </span>
            </div>
          )}

          {/* Hover overlay with actions */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center gap-2 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200',
              isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            {onEdit && (
              <button
                type="button"
                onClick={(e) => handleAction(e, onEdit)}
                className="rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 hover:scale-110"
                title="Editar"
              >
                <Edit3 size={16} />
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={(e) => handleAction(e, onDuplicate)}
                className="rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 hover:scale-110"
                title="Duplicar"
              >
                <Copy size={16} />
              </button>
            )}
            {onManageTags && (
              <button
                type="button"
                onClick={(e) => handleAction(e, onManageTags)}
                className="rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 hover:scale-110"
                title="Gerenciar tags"
              >
                <Tag size={16} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => handleAction(e, onDelete)}
                className="rounded-lg bg-red-500/20 p-2 text-red-400 transition-all hover:bg-red-500/30 hover:scale-110"
                title="Excluir"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-2">
          <p className="truncate text-xs font-medium text-text">{design.name}</p>
          <p className="mt-0.5 text-[10px] text-text-muted">
            {design.templateName}
          </p>

          {/* Tags */}
          {design.tags && design.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {design.tags.slice(0, 2).map((tagName) => (
                <span
                  key={tagName}
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium text-white"
                  style={{ backgroundColor: getTagColor(tagName) }}
                >
                  {tagName}
                </span>
              ))}
              {design.tags.length > 2 && (
                <span className="text-[9px] text-text-subtle">
                  +{design.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}
