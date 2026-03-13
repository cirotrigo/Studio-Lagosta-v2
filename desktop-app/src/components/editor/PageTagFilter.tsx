import { Tag, Settings2 } from 'lucide-react'
import { useTagsStore } from '@/stores/tags.store'
import { cn } from '@/lib/utils'

interface PageTagFilterProps {
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  onManageTags: () => void
}

export function PageTagFilter({ selectedTags, onTagsChange, onManageTags }: PageTagFilterProps) {
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

  const clearAll = () => {
    onTagsChange([])
  }

  if (projectTags.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3">
        <Tag size={16} className="text-text-subtle" />
        <span className="text-sm text-text-muted">
          Nenhuma tag cadastrada.
        </span>
        <button
          type="button"
          onClick={onManageTags}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:border-primary/40 hover:text-text"
        >
          <Settings2 size={14} />
          Gerenciar Tags
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
          Filtrar por tag:
        </span>

        {/* All pages button */}
        <button
          type="button"
          onClick={clearAll}
          className={cn(
            'rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors',
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
                'inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors',
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

        {/* Manage tags button */}
        <button
          type="button"
          onClick={onManageTags}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:border-primary/40 hover:text-text"
        >
          <Settings2 size={14} />
          Gerenciar
        </button>
      </div>

      {selectedTags.length > 0 && (
        <p className="mt-2 text-[10px] text-text-subtle">
          Mostrando paginas com {selectedTags.length === 1 ? 'a tag' : 'as tags'}:{' '}
          {selectedTags.join(', ')}
        </p>
      )}
    </div>
  )
}
