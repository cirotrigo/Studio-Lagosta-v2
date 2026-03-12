import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Tag } from 'lucide-react'
import { useTagsStore } from '@/stores/tags.store'
import { cn } from '@/lib/utils'

interface TagSelectorProps {
  selectedTags: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
  className?: string
}

export function TagSelector({ selectedTags, onChange, disabled, className }: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const tags = useTagsStore((state) => state.tags)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleTag = (tagName: string) => {
    const normalizedName = tagName.toLowerCase()
    const hasTag = selectedTags.some((t) => t.toLowerCase() === normalizedName)

    if (hasTag) {
      onChange(selectedTags.filter((t) => t.toLowerCase() !== normalizedName))
    } else {
      onChange([...selectedTags, tagName])
    }
  }

  const removeTag = (tagName: string) => {
    const normalizedName = tagName.toLowerCase()
    onChange(selectedTags.filter((t) => t.toLowerCase() !== normalizedName))
  }

  const getTagColor = (tagName: string): string => {
    const tag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280' // gray fallback
  }

  if (!tags.length) {
    return null
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex min-h-[36px] w-full items-center justify-between gap-2 rounded-lg border border-border bg-input px-3 py-1.5 text-sm transition-colors',
          'hover:border-primary/40 focus:border-primary focus:outline-none',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {selectedTags.length === 0 ? (
            <span className="text-text-muted">Selecionar tags...</span>
          ) : (
            selectedTags.map((tagName) => (
              <span
                key={tagName}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: getTagColor(tagName) }}
              >
                {tagName}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTag(tagName)
                  }}
                  className="hover:bg-white/20 rounded-full p-0.5"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-text-muted transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg">
          <div className="max-h-[200px] overflow-y-auto p-1">
            {tags.map((tag) => {
              const isSelected = selectedTags.some((t) => t.toLowerCase() === tag.name.toLowerCase())

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    isSelected ? 'bg-primary/10 text-text' : 'text-text-muted hover:bg-background/50 hover:text-text',
                  )}
                >
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{ backgroundColor: tag.color }}
                  >
                    {isSelected && <Tag size={10} className="text-white" />}
                  </span>
                  <span className="flex-1">{tag.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface TagChipProps {
  name: string
  color?: string
  size?: 'sm' | 'md'
  onRemove?: () => void
}

export function TagChip({ name, color = '#6B7280', size = 'sm', onRemove }: TagChipProps) {
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium text-white',
        sizeClasses,
      )}
      style={{ backgroundColor: color }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="hover:bg-white/20 rounded-full"
        >
          <X size={size === 'sm' ? 10 : 12} />
        </button>
      )}
    </span>
  )
}
