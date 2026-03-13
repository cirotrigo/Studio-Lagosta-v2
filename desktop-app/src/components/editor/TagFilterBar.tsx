import { Search, Settings2, Tag, X } from 'lucide-react'
import { useTagsStore } from '@/stores/tags.store'
import type { DesignFormat } from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface TagFilterBarProps {
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  selectedFormat?: DesignFormat
  onFormatChange?: (format: DesignFormat | undefined) => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onManageTags?: () => void
  showFormatFilter?: boolean
  showSearch?: boolean
}

const FORMAT_OPTIONS: { value: DesignFormat; label: string }[] = [
  { value: 'STORY', label: 'Story (9:16)' },
  { value: 'FEED_PORTRAIT', label: 'Feed (4:5)' },
  { value: 'SQUARE', label: 'Quadrado (1:1)' },
]

export function TagFilterBar({
  selectedTags,
  onTagsChange,
  selectedFormat,
  onFormatChange,
  searchQuery = '',
  onSearchChange,
  onManageTags,
  showFormatFilter = false,
  showSearch = false,
}: TagFilterBarProps) {
  const projectTags = useTagsStore((state) => state.tags)

  const toggleTag = (tagName: string) => {
    const normalizedName = tagName.toLowerCase()
    const hasTag = selectedTags.some((t) => t.toLowerCase() === normalizedName)

    if (hasTag) {
      onTagsChange(selectedTags.filter((t) => t.toLowerCase() !== normalizedName))
    } else {
      onTagsChange([...selectedTags, tagName])
    }
  }

  const clearAllTags = () => {
    onTagsChange([])
  }

  const clearAllFilters = () => {
    onTagsChange([])
    onFormatChange?.(undefined)
    onSearchChange?.('')
  }

  const hasActiveFilters = selectedTags.length > 0 || selectedFormat || searchQuery

  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        {showSearch && onSearchChange && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar designs..."
              className="h-8 w-48 rounded-lg border border-border bg-input pl-8 pr-3 text-xs text-text placeholder:text-text-subtle focus:border-primary focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Format filter */}
        {showFormatFilter && onFormatChange && (
          <select
            value={selectedFormat ?? ''}
            onChange={(e) => onFormatChange(e.target.value as DesignFormat || undefined)}
            className="h-8 rounded-lg border border-border bg-input px-3 text-xs text-text focus:border-primary focus:outline-none"
          >
            <option value="">Todos os formatos</option>
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {/* Divider */}
        {(showSearch || showFormatFilter) && projectTags.length > 0 && (
          <div className="h-6 w-px bg-border" />
        )}

        {/* Tag filter section */}
        {projectTags.length > 0 ? (
          <>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
              Tags:
            </span>

            {/* All button */}
            <button
              type="button"
              onClick={clearAllTags}
              className={cn(
                'rounded-lg border-2 px-3 py-1 text-xs font-medium transition-colors',
                selectedTags.length === 0
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-input text-text-muted hover:border-primary/40',
              )}
            >
              Todas
            </button>

            {/* Tag buttons */}
            {projectTags.map((tag) => {
              const isSelected = selectedTags.some(
                (t) => t.toLowerCase() === tag.name.toLowerCase(),
              )

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.name)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1 text-xs font-medium transition-colors',
                    isSelected
                      ? 'border-transparent text-white'
                      : 'border-border bg-input text-text-muted hover:border-primary/40',
                  )}
                  style={isSelected ? { backgroundColor: tag.color } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: isSelected ? 'white' : tag.color }}
                  />
                  {tag.name}
                </button>
              )
            })}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-text-subtle" />
            <span className="text-sm text-text-muted">
              Nenhuma tag cadastrada.
            </span>
          </div>
        )}

        {/* Clear all and manage buttons */}
        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-error/40 hover:text-error"
            >
              <X size={12} />
              Limpar filtros
            </button>
          )}
          {onManageTags && (
            <button
              type="button"
              onClick={onManageTags}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-primary/40 hover:text-text"
            >
              <Settings2 size={14} />
              Gerenciar
            </button>
          )}
        </div>
      </div>

      {/* Active filters summary */}
      {hasActiveFilters && (
        <p className="mt-2 text-[10px] text-text-subtle">
          Filtros ativos:
          {selectedTags.length > 0 && ` Tags: ${selectedTags.join(', ')}`}
          {selectedFormat && ` | Formato: ${FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.label}`}
          {searchQuery && ` | Busca: "${searchQuery}"`}
        </p>
      )}
    </div>
  )
}
