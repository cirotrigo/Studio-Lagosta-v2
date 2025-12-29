'use client'

import { useTemplatePages } from '@/hooks/use-template-pages'
import { cn } from '@/lib/utils'
import { Check, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface TemplateSelectorProps {
  templateId: number
  selectedPageId: string | null
  onSelect: (pageId: string, page: any) => void
}

export function TemplateSelector({
  templateId,
  selectedPageId,
  onSelect,
}: TemplateSelectorProps) {
  const { data: templatePages, isLoading, error } = useTemplatePages(templateId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Selecione um Modelo</h3>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">
          Erro ao carregar modelos. Por favor, tente novamente.
        </p>
      </div>
    )
  }

  if (!templatePages || templatePages.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Selecione um Modelo</h3>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <FileText className="mx-auto mb-3 h-12 w-12 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">
            Nenhum modelo disponível
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Para criar um modelo, abra uma página no editor e clique em "Marcar como Modelo".
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {templatePages.map((page) => (
          <button
            key={page.id}
            onClick={() => onSelect(page.id, page)}
            className={cn(
              'group relative aspect-[9/16] overflow-hidden rounded-xl border-2 transition-all',
              'hover:scale-[1.02] hover:shadow-xl',
              selectedPageId === page.id
                ? 'border-primary ring-4 ring-primary/30 shadow-xl'
                : 'border-border hover:border-primary/50'
            )}
          >
            {/* Thumbnail ou placeholder */}
            {page.thumbnail ? (
              <img
                src={page.thumbnail}
                alt={page.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <FileText className="h-16 w-16 text-muted-foreground" />
              </div>
            )}

            {/* Indicador de seleção */}
            {selectedPageId === page.id && (
              <div className="absolute right-3 top-3 rounded-full bg-primary p-2 shadow-lg">
                <Check className="h-5 w-5 text-primary-foreground" />
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  )
}