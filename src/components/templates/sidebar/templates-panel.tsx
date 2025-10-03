"use client"

import * as React from 'react'
import Image from 'next/image'
import { Loader2, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTemplates } from '@/hooks/use-templates'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { api } from '@/lib/api-client'
import type { TemplateDto } from '@/hooks/use-template'
import { useToast } from '@/hooks/use-toast'

const categories = [
  { id: 'all', label: 'Todos' },
  { id: 'STORY', label: 'Stories' },
  { id: 'FEED', label: 'Feed' },
  { id: 'SQUARE', label: 'Quadrado' },
]

const typeLabels: Record<string, string> = {
  STORY: 'Story',
  FEED: 'Feed',
  SQUARE: 'Quadrado',
}

export function TemplatesPanel() {
  const { toast } = useToast()
  const {
    projectId,
    templateId,
    loadTemplate,
  } = useTemplateEditor()

  const [category, setCategory] = React.useState<string>('all')
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebouncedValue(search, 400)
  const [applyingId, setApplyingId] = React.useState<number | null>(null)

  const { data, isLoading, isRefetching, refetch } = useTemplates({
    projectId,
    category: category === 'all' ? null : category,
    search: debouncedSearch ? debouncedSearch : null,
    limit: 60,
  })

  const templates = data ?? []

  const handleApplyTemplate = React.useCallback(
    async (id: number) => {
      try {
        setApplyingId(id)
        const template = await api.get<TemplateDto>(`/api/templates/${id}`)
        loadTemplate({ designData: template.designData, dynamicFields: template.dynamicFields, name: template.name })
        toast({
          title: 'Template carregado',
          description: 'O layout selecionado foi aplicado ao editor.',
        })
      } catch (error) {
        console.error('[TemplatesPanel] Failed to load template', error)
        toast({
          title: 'Erro ao carregar template',
          description:
            error instanceof Error ? error.message : 'Não foi possível carregar o template selecionado.',
          variant: 'destructive',
        })
      } finally {
        setApplyingId(null)
      }
    },
    [loadTemplate, toast],
  )

  const isFetching = isLoading || isRefetching

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar templates..."
            className="h-9"
          />
          <Button
            size="icon"
            variant="outline"
            onClick={() => refetch()}
            aria-label="Atualizar lista de templates"
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((item) => {
            const isActive = category === item.id
            return (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setCategory(item.id)}
                className="text-xs"
              >
                {item.label}
              </Button>
            )
          })}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid gap-3 pr-3 md:grid-cols-2">
          {isLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="rounded-lg border border-border/30 bg-muted/40 p-3"
              >
                <Skeleton className="mb-3 h-32 w-full" />
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}

          {!isLoading && templates.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              Nenhum template encontrado. Ajuste os filtros ou crie um novo template.
            </div>
          )}

          {templates.map((template) => {
            const isCurrent = templateId === template.id
            const isApplying = applyingId === template.id
            const typeLabel = typeLabels[template.type] ?? template.type

            return (
              <motion.div
                key={template.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={cn(
                  'flex flex-col overflow-hidden rounded-lg border border-border/40 bg-card/70 shadow-sm transition hover:border-primary/40',
                  isCurrent && 'border-primary/80',
                )}
              >
                <div className="relative aspect-[3/4] w-full bg-muted">
                  {template.thumbnailUrl ? (
                    <Image
                      src={template.thumbnailUrl}
                      alt={template.name}
                      fill
                      sizes="200px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Sem thumbnail
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">{template.name}</h3>
                      <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
                        {typeLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{template.dimensions}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-end gap-2">
                    {isCurrent && <Badge variant="outline">Atual</Badge>}
                    <Button
                      size="sm"
                      onClick={() => handleApplyTemplate(template.id)}
                      disabled={isApplying}
                    >
                      {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Usar template
                    </Button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
