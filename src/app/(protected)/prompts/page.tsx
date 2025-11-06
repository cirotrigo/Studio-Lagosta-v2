"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, FileText } from 'lucide-react'
import { usePrompts } from '@/hooks/use-prompts'
import { useSetPageMetadata } from '@/contexts/page-metadata'
import { PromptDialog } from '@/components/prompts/prompt-dialog'
import { PromptCard } from '@/components/prompts/prompt-card'
import { PromptFilters } from '@/components/prompts/prompt-filters'
import type { Prompt, PromptFilters as PromptFiltersType } from '@/types/prompt'

export default function PromptsPage() {
  const [filters, setFilters] = React.useState<PromptFiltersType>({
    search: '',
    category: undefined,
  })
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingPrompt, setEditingPrompt] = React.useState<Prompt | undefined>()
  const [dialogMode, setDialogMode] = React.useState<'create' | 'edit'>('create')

  const { data: prompts = [], isLoading } = usePrompts(filters)

  useSetPageMetadata({
    title: 'Meus Prompts',
    description: 'Gerencie seus prompts reutilizáveis para geração de imagens',
    breadcrumbs: [
      { label: 'Início', href: '/studio' },
      { label: 'Prompts' },
    ],
  })

  const handleCreateNew = () => {
    setEditingPrompt(undefined)
    setDialogMode('create')
    setDialogOpen(true)
  }

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt)
    setDialogMode('edit')
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingPrompt(undefined)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Prompt
        </Button>
      </div>

      {/* Filtros */}
      <PromptFilters filters={filters} onFiltersChange={setFilters} />

      {/* Lista de Prompts */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-2/3 mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">
            {filters.search || filters.category
              ? 'Nenhum prompt encontrado'
              : 'Nenhum prompt criado ainda'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {filters.search || filters.category
              ? 'Tente ajustar os filtros de busca'
              : 'Crie seu primeiro prompt para começar a reutilizar em suas gerações'}
          </p>
          {!filters.search && !filters.category && (
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Prompt
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {prompts.map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} onEdit={handleEdit} />
            ))}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            {prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'}{' '}
            {filters.search || filters.category ? 'encontrado(s)' : 'criado(s)'}
          </div>
        </>
      )}

      {/* Dialog de Criação/Edição */}
      <PromptDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        prompt={editingPrompt}
        mode={dialogMode}
      />
    </div>
  )
}
