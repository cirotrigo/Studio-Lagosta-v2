"use client"

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LayerSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function LayerSearch({ value, onChange, placeholder = 'Buscar camadas...' }: LayerSearchProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  // Atalho Ctrl+F para focar no campo de busca
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 pr-8 text-xs"
      />
      {value && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2"
          onClick={handleClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
