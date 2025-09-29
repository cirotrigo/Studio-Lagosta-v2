"use client"

import * as React from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DropdownTriggerButton } from '@/components/ui/dropdown-trigger-button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export type AutocompleteItem = { value: string; label: string }

type AutocompleteProps = {
  items: AutocompleteItem[]
  value?: string
  onChange: (value: string) => void
  icon?: React.ReactNode
  placeholder?: string
  buttonAriaLabel?: string
  className?: string
}

export function Autocomplete({
  items,
  value,
  onChange,
  icon,
  placeholder = 'Buscar... ',
  buttonAriaLabel,
  className,
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q))
  }, [items, query])

  React.useEffect(() => {
    if (open) setActiveIndex(0)
  }, [open, query])

  const selected = React.useMemo(() => items.find((i) => i.value === value), [items, value])

  const selectAt = (idx: number) => {
    const item = filtered[idx]
    if (item) {
      onChange(item.value)
      setOpen(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery('') }}>
      <DropdownMenuTrigger asChild>
        <DropdownTriggerButton isOpen={open} aria-label={buttonAriaLabel} className={cn('min-w-[140px] justify-start', className)}>
          {icon}
          <span className="truncate max-w-[200px]">{selected?.label || 'Selecionar...'}</span>
        </DropdownTriggerButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-0">
        <div className="p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                selectAt(activeIndex)
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
        </div>
        <ScrollArea className="max-h-72 p-1">
          <div role="listbox" aria-activedescendant={filtered[activeIndex]?.value} className="space-y-1">
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">Sem resultados</div>
            )}
            {filtered.map((item, idx) => (
              <button
                key={item.value}
                role="option"
                aria-selected={value === item.value}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left text-sm',
                  idx === activeIndex ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
                )}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

