'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
  maxTags?: number
}

function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Adicionar tag...',
  disabled = false,
  className,
  maxTags = 10,
}: TagInputProps) {
  const [draft, setDraft] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const blurTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = React.useMemo(() => {
    const q = normalizeTag(draft)
    return suggestions
      .filter((s) => !value.includes(s) && (q === '' || s.includes(q)))
      .slice(0, 8)
  }, [suggestions, value, draft])

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag || value.includes(tag) || value.length >= maxTags) return
    onChange([...value, tag])
    setDraft('')
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (draft.trim()) {
        event.preventDefault()
        addTag(draft)
      }
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      removeTag(value[value.length - 1])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex flex-wrap gap-1 rounded-md border border-input bg-transparent px-2 py-1 min-h-9 text-sm',
          'focus-within:ring-1 focus-within:ring-ring focus-within:border-ring',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  removeTag(tag)
                }}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remover ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => {
              if (blurTimeout.current) clearTimeout(blurTimeout.current)
              setOpen(true)
            }}
            onBlur={() => {
              blurTimeout.current = setTimeout(() => setOpen(false), 150)
            }}
            onKeyDown={handleKey}
            placeholder={value.length === 0 ? placeholder : ''}
            disabled={value.length >= maxTags}
            className="flex-1 min-w-[100px] outline-none bg-transparent text-sm py-0.5 placeholder:text-muted-foreground"
          />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  addTag(suggestion)
                }}
                className="block w-full text-left rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
