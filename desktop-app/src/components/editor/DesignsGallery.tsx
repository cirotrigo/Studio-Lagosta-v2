import { Layers, Tag } from 'lucide-react'
import { useTagsStore } from '@/stores/tags.store'
import {
  useProjectDesigns,
  getAspectRatioClass,
  type Design,
  type DesignFormat,
} from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface DesignsGalleryProps {
  projectId: number | undefined
  selectedTags?: string[]
  format?: DesignFormat
  search?: string
  onDesignSelect?: (design: Design) => void
}

export function DesignsGallery({
  projectId,
  selectedTags = [],
  format,
  search,
  onDesignSelect,
}: DesignsGalleryProps) {
  const projectTags = useTagsStore((state) => state.tags)

  const { data, isLoading, error } = useProjectDesigns(projectId, {
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    format,
    search,
  })

  // Helper to get tag color
  const getTagColor = (tagName: string): string => {
    const tag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-text-muted">Carregando designs...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers size={40} className="mb-3 text-error opacity-50" />
        <p className="text-sm text-text-muted">Erro ao carregar designs</p>
        <p className="mt-1 text-xs text-text-subtle">
          {error instanceof Error ? error.message : 'Erro desconhecido'}
        </p>
      </div>
    )
  }

  if (!data || data.designs.length === 0) {
    if (selectedTags.length > 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Tag size={40} className="mb-3 text-text-subtle opacity-50" />
          <p className="text-sm text-text-muted">
            Nenhum design com {selectedTags.length === 1 ? 'a tag' : 'as tags'} selecionada(s)
          </p>
          <p className="mt-1 text-xs text-text-subtle">
            Selecione outras tags ou adicione tags aos designs no Editor
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers size={40} className="mb-3 text-text-subtle opacity-50" />
        <p className="text-sm text-text-muted">Nenhum design encontrado</p>
        <p className="mt-1 text-xs text-text-subtle">
          Crie designs no Editor para usa-los aqui
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {data.designs.map((design) => (
        <button
          key={design.id}
          type="button"
          onClick={() => onDesignSelect?.(design)}
          className="group rounded-xl border border-border bg-card/60 p-2 text-left transition-colors hover:border-primary/40"
        >
          {/* Thumbnail with proper aspect ratio */}
          <div
            className={cn(
              'overflow-hidden rounded-lg border border-border bg-[#0f172a]',
              getAspectRatioClass(design.format),
            )}
          >
            {design.thumbnail ? (
              <img
                src={design.thumbnail}
                alt={design.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/80">
                  Sem preview
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="mt-2">
            <p className="truncate text-xs font-medium text-text">{design.name}</p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {design.templateName}
            </p>

            {/* Tags */}
            {design.tags && design.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {design.tags.slice(0, 2).map((tagName) => (
                  <span
                    key={tagName}
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium text-white"
                    style={{ backgroundColor: getTagColor(tagName) }}
                  >
                    {tagName}
                  </span>
                ))}
                {design.tags.length > 2 && (
                  <span className="text-[9px] text-text-subtle">
                    +{design.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
