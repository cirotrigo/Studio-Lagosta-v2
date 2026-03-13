import { Layers, Tag } from 'lucide-react'
import {
  useProjectDesigns,
  type Design,
  type DesignFormat,
} from '@/hooks/use-project-designs'
import { TemplateCard } from './TemplateCard'

interface DesignsGalleryProps {
  projectId: number | undefined
  selectedTags?: string[]
  format?: DesignFormat
  search?: string
  onDesignSelect?: (design: Design) => void
  onDesignEdit?: (design: Design) => void
  onDesignDuplicate?: (design: Design) => void
  onDesignDelete?: (design: Design) => void
  onDesignManageTags?: (design: Design) => void
}

// Skeleton card for loading state
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-2">
      <div className="aspect-[4/5] animate-pulse rounded-lg bg-input/40" />
      <div className="mt-2 space-y-1.5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-input/40" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-input/40" />
        <div className="flex gap-1">
          <div className="h-4 w-10 animate-pulse rounded bg-input/40" />
          <div className="h-4 w-12 animate-pulse rounded bg-input/40" />
        </div>
      </div>
    </div>
  )
}

export function DesignsGallery({
  projectId,
  selectedTags = [],
  format,
  search,
  onDesignSelect,
  onDesignEdit,
  onDesignDuplicate,
  onDesignDelete,
  onDesignManageTags,
}: DesignsGalleryProps) {
  const { data, isLoading, error } = useProjectDesigns(projectId, {
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    format,
    search,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
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
        <TemplateCard
          key={design.id}
          design={design}
          onSelect={() => onDesignSelect?.(design)}
          onEdit={onDesignEdit ? () => onDesignEdit(design) : undefined}
          onDuplicate={onDesignDuplicate ? () => onDesignDuplicate(design) : undefined}
          onDelete={onDesignDelete ? () => onDesignDelete(design) : undefined}
          onManageTags={onDesignManageTags ? () => onDesignManageTags(design) : undefined}
        />
      ))}
    </div>
  )
}
