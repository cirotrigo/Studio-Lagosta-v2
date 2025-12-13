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
import { TemplatePageSelectorDialog } from './template-page-selector-dialog'
import type { DesignData, Layer, DynamicField } from '@/types/template'

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
  const [selectedTemplate, setSelectedTemplate] = React.useState<{
    id: number
    name: string
    dynamicFields?: unknown[] | null
  } | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  const { data, isLoading, isRefetching, refetch } = useTemplates({
    projectId,
    category: category === 'all' ? null : category,
    search: debouncedSearch ? debouncedSearch : null,
    limit: 60,
  })

  const templates = data ?? []

  const handleApplyTemplate = React.useCallback(
    async (id: number, name: string) => {
      try {
        setApplyingId(id)
        const template = await api.get<TemplateDto>(`/api/templates/${id}`)
        setSelectedTemplate({
          id: template.id,
          name: template.name,
          dynamicFields: template.dynamicFields,
        })
        setIsDialogOpen(true)
      } catch (_error) {
        console.error('[TemplatesPanel] Failed to load template', _error)
        toast({
          title: 'Erro ao carregar template',
          description:
            _error instanceof Error ? _error.message : 'Não foi possível carregar o template selecionado.',
          variant: 'destructive',
        })
      } finally {
        setApplyingId(null)
      }
    },
    [toast],
  )

  const handleSelectPage = React.useCallback(
    (page: { id: string; name: string; width: number; height: number; layers: Layer[]; background: string | null }) => {
      if (!selectedTemplate) return

      try {
        // Criar um DesignData com base na página selecionada
        const designData: DesignData = {
          canvas: {
            width: page.width,
            height: page.height,
            backgroundColor: page.background ?? undefined,
          },
          layers: page.layers,
        }

        loadTemplate({
          designData,
          dynamicFields: Array.isArray(selectedTemplate.dynamicFields)
            ? (selectedTemplate.dynamicFields as unknown as DynamicField[])
            : null,
        })

        toast({
          title: 'Página aplicada',
          description: `A página "${page.name}" foi aplicada ao editor.`,
        })

        setIsDialogOpen(false)
        setSelectedTemplate(null)
      } catch (_error) {
        console.error('[TemplatesPanel] Failed to apply page', _error)
        toast({
          title: 'Erro ao aplicar página',
          description:
            _error instanceof Error ? _error.message : 'Não foi possível aplicar a página selecionada.',
          variant: 'destructive',
        })
      }
    },
    [selectedTemplate, loadTemplate, toast],
  )

  const isFetching = isLoading || isRefetching

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="flex flex-shrink-0 flex-col gap-3">
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

      <ScrollArea className="flex-1 min-h-0">
        <div className="grid gap-3 pr-3 md:grid-cols-2">
          {isLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="rounded-md border border-border/30 bg-muted/40 p-2.5"
              >
                <Skeleton className="mb-2 h-24 w-full" />
                <Skeleton className="mb-1.5 h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
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

            // Calcular dimensões do thumbnail baseado no tipo
            const aspectRatios: Record<string, string> = {
              STORY: 'aspect-[9/16]', // 1080x1920
              FEED: 'aspect-[4/5]',   // 1080x1350
              SQUARE: 'aspect-square', // 1080x1080
            }
            const aspectRatio = aspectRatios[template.type] ?? 'aspect-[3/4]'

            return (
              <motion.div
                key={template.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={cn(
                  'flex flex-col overflow-hidden rounded-md border border-border/40 bg-card/70 shadow-sm transition hover:border-primary/40 hover:shadow-md',
                  isCurrent && 'border-primary/80 ring-1 ring-primary/20',
                )}
              >
                <div className={cn('relative w-full bg-muted', aspectRatio)}>
                  {template.thumbnailUrl ? (
                    <Image
                      src={template.thumbnailUrl}
                      alt={template.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 160px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground opacity-60">
                      Sem preview
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  <div className="space-y-0.5">
                    <h3 className="line-clamp-1 text-sm font-semibold leading-tight">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {typeLabel} • {template.dimensions}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    {isCurrent && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Atual</Badge>}
                    <Button
                      size="sm"
                      onClick={() => handleApplyTemplate(template.id, template.name)}
                      disabled={isApplying}
                      className="ml-auto h-8 text-xs px-3"
                    >
                      {isApplying && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                      Usar
                    </Button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </ScrollArea>

      {selectedTemplate && (
        <TemplatePageSelectorDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          templateId={selectedTemplate.id}
          templateName={selectedTemplate.name}
          onSelectPage={handleSelectPage}
        />
      )}
    </div>
  )
}
