'use client'

import { useState } from 'react'
import { Plus, Search, Grid, List, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAdminComponents } from '@/hooks/admin/use-admin-components'
import { ComponentGrid } from '@/components/admin/cms/component-grid'
import { CreateComponentDialog } from '@/components/admin/cms/create-component-dialog'

export default function AdminComponentsPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'custom'>('all')

  // Fetch components based on filters
  const type = typeFilter === 'all' ? undefined : typeFilter
  const { data: componentsData, isLoading } = useAdminComponents(type)

  // Filter components by search query and scope
  const filteredComponents = componentsData?.components.filter((component) => {
    const matchesSearch =
      !searchQuery ||
      component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      component.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesScope =
      scopeFilter === 'all' ||
      (scopeFilter === 'global' && component.isGlobal) ||
      (scopeFilter === 'custom' && !component.isGlobal)

    return matchesSearch && matchesScope
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Componentes</h1>
          <p className="text-muted-foreground">
            Biblioteca de componentes reutilizáveis
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Componente
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar componentes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="HERO">Hero</SelectItem>
              <SelectItem value="BENTO_GRID">Bento Grid</SelectItem>
              <SelectItem value="FAQ">FAQ</SelectItem>
              <SelectItem value="AI_STARTER">AI Starter</SelectItem>
              <SelectItem value="PRICING">Pricing</SelectItem>
              <SelectItem value="CTA">CTA</SelectItem>
              <SelectItem value="CUSTOM">Custom</SelectItem>
            </SelectContent>
          </Select>

          {/* Scope Filter */}
          <Select value={scopeFilter} onValueChange={(v: any) => setScopeFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Escopo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="global">
                <div className="flex items-center">
                  <Globe className="mr-2 h-4 w-4" />
                  Globais
                </div>
              </SelectItem>
              <SelectItem value="custom">Personalizados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Components Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            <p className="text-muted-foreground">Carregando componentes...</p>
          </div>
        </div>
      ) : filteredComponents && filteredComponents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Plus className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">Nenhum componente encontrado</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {searchQuery
              ? 'Tente ajustar sua busca'
              : 'Crie seu primeiro componente reutilizável'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Componente
            </Button>
          )}
        </div>
      ) : (
        <ComponentGrid
          components={filteredComponents || []}
          viewMode={viewMode}
        />
      )}

      {/* Create Dialog */}
      <CreateComponentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  )
}
