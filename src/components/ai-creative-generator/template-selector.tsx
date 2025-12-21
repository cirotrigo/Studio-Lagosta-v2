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
      <h3 className="text-lg font-semibold">Selecione um Modelo</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {templatePages.map((page) => (
          <button
            key={page.id}
            onClick={() => onSelect(page.id, page)}
            className={cn(
              'group relative aspect-[9/16] overflow-hidden rounded-lg border-2 transition-all',
              'hover:ring-2 hover:ring-primary hover:ring-offset-2',
              selectedPageId === page.id
                ? 'border-primary ring-2 ring-primary ring-offset-2'
                : 'border-gray-200'
            )}
          >
            {/* Thumbnail ou placeholder */}
            {page.thumbnail ? (
              <img
                src={page.thumbnail}
                alt={page.templateName || page.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-100">
                <FileText className="h-12 w-12 text-gray-400" />
              </div>
            )}

            {/* Overlay com nome */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-xs font-medium text-white">
                {page.templateName || page.name}
              </p>
            </div>

            {/* Indicador de seleção */}
            {selectedPageId === page.id && (
              <div className="absolute right-2 top-2 rounded-full bg-primary p-1">
                <Check className="h-4 w-4 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}