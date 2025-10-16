"use client"

import * as React from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PROMPT_CATEGORIES } from '@/types/prompt'
import type { PromptFilters as PromptFiltersType } from '@/types/prompt'

interface PromptFiltersProps {
  filters: PromptFiltersType
  onFiltersChange: (filters: PromptFiltersType) => void
}

export function PromptFilters({ filters, onFiltersChange }: PromptFiltersProps) {
  const handleSearchChange = (search: string) => {
    onFiltersChange({ ...filters, search })
  }

  const handleCategoryChange = (category: string) => {
    onFiltersChange({
      ...filters,
      category: category === 'all' ? undefined : category,
    })
  }

  const handleClearFilters = () => {
    onFiltersChange({ search: '', category: undefined })
  }

  const hasActiveFilters = filters.search || filters.category;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por título, conteúdo ou tags..."
          value={filters.search || ''}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-2">
        <Select
          value={filters.category || 'all'}
          onValueChange={handleCategoryChange}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {PROMPT_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearFilters}
            title="Limpar filtros"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
